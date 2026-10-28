import type { AuthContext } from '../common/auth.types';
import type { SearchTiming } from '../search/search-timing';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      searchTiming?: SearchTiming;
    }
  }
}

export {};
