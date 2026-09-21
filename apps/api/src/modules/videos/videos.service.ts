import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const YT_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const BARE_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /(?:list=|^)(PL[A-Za-z0-9_-]{16,}|UU[A-Za-z0-9_-]{22}|OL[A-Za-z0-9_-]+)$/;

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (BARE_ID.test(s)) return s;
  const m = s.match(YT_ID);
  return m ? m[1] : null;
}

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * 影片庫：YouTube 來源不需要 API 金鑰。
 * - 單支：oEmbed 取標題／縮圖（不公開影片可用；私人影片會失敗但仍以 ID 入庫）
 * - 播放清單：公開 RSS feed（最多最近 15 支；不公開影片不會出現在 feed）
 */
@Injectable()
export class VideosService {
  private readonly log = new Logger(VideosService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(provider?: string) {
    return this.prisma.videoAsset.findMany({ where: provider ? { provider } : {}, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  remove(id: string) {
    return this.prisma.videoAsset.delete({ where: { id } });
  }

  async importYouTube(input: { text?: string; urls?: string[]; playlist?: string }) {
    const raw = [...(input.urls ?? []), ...(input.text ?? '').split(/\r?\n|,|\s+/)].map((s) => s.trim()).filter(Boolean);
    const ids = new Set<string>();
    const bare = new Set<string>();
    const rejected: string[] = [];
    for (const r of raw) {
      const id = parseYouTubeId(r);
      if (!id) rejected.push(r);
      else {
        ids.add(id);
        if (BARE_ID.test(r)) bare.add(id);
      }
    }
    let playlistCount = 0;
    if (input.playlist) {
      const m = input.playlist.trim().match(PLAYLIST_ID);
      const listId = m ? m[1] : input.playlist.trim();
      const feed = await this.fetchPlaylistFeed(listId);
      for (const v of feed) {
        ids.add(v.id);
        playlistCount++;
      }
    }
    if (!ids.size) throw new BadRequestException('no valid YouTube URL / ID found');
    const imported = [];
    for (const id of ids) {
      const meta = await this.oembed(id);
      // 裸 11 字元字串可能只是普通文字：oEmbed 查不到就不入庫
      if (bare.has(id) && !meta.title) {
        rejected.push(id);
        continue;
      }
      const row = await this.prisma.videoAsset.upsert({
        where: { provider_externalId: { provider: 'youtube', externalId: id } },
        update: { ...(meta.title ? { title: meta.title } : {}), thumbnailUrl: meta.thumbnail_url ?? undefined, author: meta.author_name ?? undefined },
        create: { provider: 'youtube', externalId: id, title: meta.title ?? `YouTube ${id}`, thumbnailUrl: meta.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, author: meta.author_name ?? null },
      });
      imported.push({ id: row.id, externalId: row.externalId, title: row.title, resolved: !!meta.title });
    }
    return { imported, rejected, playlistCount };
  }

  private async oembed(id: string): Promise<OEmbed> {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { headers: { accept: 'application/json' } });
      if (!res.ok) return {};
      return (await res.json()) as OEmbed;
    } catch (e) {
      this.log.warn(`oembed failed for ${id}: ${e instanceof Error ? e.message : e}`);
      return {};
    }
  }

  private async fetchPlaylistFeed(listId: string): Promise<{ id: string; title: string }[]> {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(listId)}`);
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const xml = await res.text();
      const out: { id: string; title: string }[] = [];
      for (const entry of xml.split('<entry>').slice(1)) {
        const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
        const title = entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
        if (id) out.push({ id, title });
      }
      return out;
    } catch (e) {
      throw new BadRequestException(`playlist feed failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}
