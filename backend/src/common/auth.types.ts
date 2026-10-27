export interface AuthContext {
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
  method: 'cookie' | 'apiKey';
  csrf?: string | null;
  sid?: string;
}
