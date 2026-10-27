import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-auth.decorator';
import type { AuthContext } from '../common/auth.types';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse()
  stream(@CurrentUser() user: AuthContext['user']): Observable<MessageEvent> {
    return merge(
      this.events.streamFor(user.id),
      interval(15_000).pipe(
        map(() => ({
          data: { type: 'ping', timestamp: new Date().toISOString() },
        })),
      ),
    );
  }
}
