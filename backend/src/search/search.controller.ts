import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-auth.decorator';
import type { AuthContext } from '../common/auth.types';
import { AuthGuard } from '../auth/auth.guard';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  async find(@CurrentUser() user: AuthContext['user'], @Query() query: SearchQueryDto) {
    return this.search.search(user.id, {
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
      category: query.category,
      author: query.author,
      tags: query.tags ? query.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      sort: query.sort,
    });
  }
}
