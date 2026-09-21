import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../../common/guards';
import { CatalogService } from './catalog.service';

/** 公開目錄 API。 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  products(@Query('type') type?: string) {
    return this.catalog.listProducts(type);
  }

  @Get('courses')
  courses() {
    return this.catalog.listCourses();
  }

  @Get('courses/:slug')
  course(@Param('slug') slug: string) {
    return this.catalog.getCourse(slug);
  }
}

/** 後台目錄維護（管理員 session）。 */
@Controller('admin/catalog')
@UseGuards(AdminSessionGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('courses')
  courses() {
    return this.catalog.listAllCourses();
  }

  @Get('courses/:id')
  course(@Param('id') id: string) {
    return this.catalog.getCourseAdmin(id);
  }

  @Post('products')
  createProduct(@Body() body: unknown) {
    return this.catalog.createProduct(body);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateProduct(id, body);
  }

  @Post('courses')
  createCourse(@Body() body: unknown) {
    return this.catalog.createCourse(body);
  }

  @Patch('courses/:id')
  updateCourse(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateCourse(id, body);
  }

  @Post('courses/:id/chapters')
  addChapter(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.addChapter(id, body);
  }

  @Patch('chapters/:id')
  updateChapter(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateChapter(id, body);
  }

  @Delete('chapters/:id')
  deleteChapter(@Param('id') id: string) {
    return this.catalog.deleteChapter(id);
  }
}
