import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../../common/guards';
import { MenuService, parseLocation } from '@sitekit/core';

@Controller('content')
export class PublicMenuController {
  constructor(private readonly menu: MenuService) {}

  /** 前台導覽：可見節點、href 已解析 */
  @Get('menu')
  menuTree(@Query('location') location?: string) {
    return this.menu.tree(true, parseLocation(location));
  }
}

@Controller('admin/menu')
@UseGuards(AdminSessionGuard)
export class AdminMenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  get(@Query('location') location?: string) {
    return this.menu.tree(false, parseLocation(location));
  }

  /** 整棵覆寫：?location=header|footer，{ items: [{ label, kind, contentId|href, isVisible, newTab, children }] } */
  @Put()
  put(@Body() body: unknown, @Query('location') location?: string) {
    return this.menu.replace(body, parseLocation(location));
  }
}
