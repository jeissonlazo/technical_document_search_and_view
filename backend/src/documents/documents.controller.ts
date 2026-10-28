import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { CurrentUser } from '../common/current-auth.decorator';
import type { AuthContext } from '../common/auth.types';
import { CreateDocumentDto } from './documents.dto';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(CsrfGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthContext['user'],
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateDocumentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.documents.create(user.id, file, dto, idempotencyKey);
  }

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(CsrfGuard)
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: 30 * 1024 * 1024, files: 50 },
    }),
  )
  uploadBatch(
    @CurrentUser() user: AuthContext['user'],
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('metadata') metadata: string | undefined,
  ) {
    return this.documents.createBatch(user.id, files, metadata);
  }

  @Put(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(CsrfGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  update(
    @CurrentUser() user: AuthContext['user'],
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documents.update(user.id, id, file, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthContext['user'], @Param('id') id: string) {
    return this.documents.findOne(user.id, id);
  }

  @Get(':id/content')
  async content(
    @CurrentUser() user: AuthContext['user'],
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const object = await this.documents.getContent(user.id, id, range);

    res.setHeader('Content-Type', object.contentType ?? object.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', object.acceptRanges ?? 'bytes');
    if (object.contentLength) res.setHeader('Content-Length', String(object.contentLength));
    if (object.contentRange) res.setHeader('Content-Range', object.contentRange);

    res.status(range ? 206 : 200);
    object.body.pipe(res);
  }

  @Post(':id/retry')
  @UseGuards(CsrfGuard)
  retry(@CurrentUser() user: AuthContext['user'], @Param('id') id: string) {
    return this.documents.retry(user.id, id);
  }
}
