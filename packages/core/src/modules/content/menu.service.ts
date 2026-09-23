import { BadRequestException, Injectable } from '../../compat';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { RevalidateService } from '../settings/revalidate.service';

const itemInput: z.ZodType<MenuInput, z.ZodTypeDef, MenuInputRaw> = z.lazy(() =>
  z.object({
    label: z.string().trim().min(1).max(60),
    kind: z.enum(['page', 'route', 'link']).default('route'),
    contentId: z.string().nullable().optional(),
    href: z.string().max(500).nullable().optional(),
    isVisible: z.boolean().optional(),
    newTab: z.boolean().optional(),
    children: z.array(itemInput).max(50).optional(),
  }),
);
/** 輸入型（kind 可省略＝route） */
interface MenuInputRaw {
  label: string;
  kind?: 'page' | 'route' | 'link';
  contentId?: string | null;
  href?: string | null;
  isVisible?: boolean;
  newTab?: boolean;
  children?: MenuInputRaw[];
}
export interface MenuInput {
  label: string;
  kind: 'page' | 'route' | 'link';
  contentId?: string | null;
  href?: string | null;
  isVisible?: boolean;
  newTab?: boolean;
  children?: MenuInput[];
}
const treeInput = z.object({ items: z.array(itemInput).max(50) });

export interface MenuNode {
  id: string;
  label: string;
  kind: string;
  contentId: string | null;
  href: string;
  isVisible: boolean;
  newTab: boolean;
  content?: { title: string; slug: string; type: string; status: string } | null;
  children: MenuNode[];
}

/** 網站架構樹／選單：公開端只回可見節點與解析後的 href；後台整棵覆寫（交易內先刪後建）。 */
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reval: RevalidateService,
  ) {}

  private resolveHref(i: { kind: string; href: string | null; content: { slug: string; type: string } | null }) {
    if (i.kind === 'page' && i.content) return i.content.type === 'page' ? (i.content.slug === 'home' ? '/' : `/p/${i.content.slug}`) : `/blog/${i.content.slug}`;
    return i.href ?? '#';
  }

  async tree(visibleOnly: boolean, location: 'header' | 'footer' = 'header'): Promise<MenuNode[]> {
    const rows = await this.prisma.menuItem.findMany({ where: { location }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], include: { content: { select: { title: true, slug: true, type: true, status: true } } } });
    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const k = r.parentId ?? null;
      byParent.set(k, [...(byParent.get(k) ?? []), r]);
    }
    const build = (parentId: string | null): MenuNode[] =>
      (byParent.get(parentId) ?? [])
        .filter((r) => !visibleOnly || (r.isVisible && (r.kind !== 'page' || r.content?.status === 'published')))
        .map((r) => ({ id: r.id, label: r.label, kind: r.kind, contentId: r.contentId, href: this.resolveHref(r), isVisible: r.isVisible, newTab: r.newTab, content: visibleOnly ? undefined : r.content, children: build(r.id) }));
    return build(null);
  }

  async replace(input: unknown, location: 'header' | 'footer' = 'header') {
    const { items } = treeInput.parse(input);
    const contentIds = new Set<string>();
    const walk = (list: MenuInput[], depth: number) => {
      if (depth > 2) throw new BadRequestException('menu depth is limited to 2 levels');
      for (const i of list) {
        if (i.kind === 'page' && !i.contentId) throw new BadRequestException(`「${i.label}」需綁定頁面`);
        if (i.kind !== 'page' && !i.href) throw new BadRequestException(`「${i.label}」需填網址或路徑`);
        if (i.kind === 'route' && i.href && !i.href.startsWith('/')) throw new BadRequestException(`「${i.label}」站內路徑需以 / 開頭`);
        if (i.contentId) contentIds.add(i.contentId);
        if (i.children?.length) walk(i.children, depth + 1);
      }
    };
    walk(items, 1);
    if (contentIds.size) {
      const found = await this.prisma.content.count({ where: { id: { in: [...contentIds] } } });
      if (found !== contentIds.size) throw new BadRequestException('some pages no longer exist');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.menuItem.deleteMany({ where: { location } });
      const create = async (list: MenuInput[], parentId: string | null) => {
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          const row = await tx.menuItem.create({ data: { location, parentId, order: i, label: it.label, kind: it.kind, contentId: it.kind === 'page' ? it.contentId! : null, href: it.kind === 'page' ? null : it.href!, isVisible: it.isVisible ?? true, newTab: it.newTab ?? false } });
          if (it.children?.length) await create(it.children, row.id);
        }
      };
      await create(items, null);
    });
    this.reval.trigger('menu');
    return this.tree(false, location);
  }
}
export const parseLocation = (v: unknown): 'header' | 'footer' => (v === 'footer' ? 'footer' : 'header');
