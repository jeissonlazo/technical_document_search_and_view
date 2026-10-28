import {
  Controller,
  Get,
  Logger,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/current-auth.decorator';
import type { AuthContext } from '../common/auth.types';
import { AuthGuard } from '../auth/auth.guard';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';
import type { SearchTiming } from './search-timing';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly search: SearchService) {}

  @Get()
  async find(
    @CurrentUser() user: AuthContext['user'],
    @Query() query: SearchQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const timing: SearchTiming = request.searchTiming ?? {};
    timing.startedAt ??= performance.now();

    const result = await this.search.search(
      user.id,
      {
        q: query.q,
        page: query.page,
        pageSize: query.pageSize,
        category: query.category,
        author: query.author,
        tags: query.tags
          ? query.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
          : undefined,
        sort: query.sort,
      },
      timing,
    );

    timing.totalMs = performance.now() - (timing.startedAt ?? performance.now());
    timing.hits = result.items.length;
    response.setHeader('Server-Timing', formatServerTiming(timing));

    if (process.env.SEARCH_TIMING_LOG !== 'false') {
      this.logger.log(
        JSON.stringify({
          event: 'search_timing',
          page: result.page,
          pageSize: result.pageSize,
          hits: timing.hits,
          total: result.total,
          hasCategory: Boolean(query.category),
          hasAuthor: Boolean(query.author),
          hasTags: Boolean(query.tags),
          authMs: round(timing.authMs),
          elasticsearchMs: round(timing.elasticsearchMs),
          databaseMs: round(timing.databaseMs),
          totalMs: round(timing.totalMs),
        }),
      );
    }

    return result;
  }
}

function formatServerTiming(timing: SearchTiming): string {
  return [
    timing.authMs !== undefined ? `auth;dur=${round(timing.authMs)}` : null,
    timing.elasticsearchMs !== undefined
      ? `elasticsearch;dur=${round(timing.elasticsearchMs)}`
      : null,
    timing.databaseMs !== undefined ? `postgres;dur=${round(timing.databaseMs)}` : null,
    timing.totalMs !== undefined ? `total;dur=${round(timing.totalMs)}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

function round(value: number | undefined): number {
  return Math.round((value ?? 0) * 100) / 100;
}
