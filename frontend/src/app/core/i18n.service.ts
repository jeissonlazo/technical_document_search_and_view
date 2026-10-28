import { Injectable, signal } from '@angular/core';

type Lang = 'es' | 'en';

const DICTIONARIES: Record<Lang, Record<string, string>> = {
  es: {
    'app.name': 'DocuTech',
    'nav.search': 'Buscar',
    'nav.upload': 'Cargar',
    'nav.settings': 'Ajustes',
    'nav.login': 'Iniciar sesión',
    'nav.register': 'Crear cuenta',
    'nav.logout': 'Salir',
    'nav.theme': 'Tema',
    'nav.language': 'Idioma',
    'apiKeys.title': 'API keys',
    'apiKeys.subtitle': 'Claves personales para acceso programático. Se muestran una sola vez.',
    'apiKeys.name': 'Nombre de la clave',
    'apiKeys.create': 'Crear API key',
    'apiKeys.once': 'Copia esta clave ahora; no se volverá a mostrar.',
    'apiKeys.copy': 'Copiar',
    'apiKeys.empty': 'No tienes API keys activas.',
    'apiKeys.revoke': 'Revocar',
    'auth.email': 'Email',
    'auth.password': 'Contraseña',
    'auth.loginTitle': 'Inicia sesión',
    'auth.registerTitle': 'Crea tu cuenta',
    'auth.loginAction': 'Entrar',
    'auth.registerAction': 'Registrarme',
    'auth.noAccount': '¿No tienes cuenta?',
    'auth.hasAccount': '¿Ya tienes cuenta?',
    'upload.title': 'Cargar documentos',
    'upload.select': 'Selecciona uno o varios archivos',
    'upload.metadata': 'Metadatos',
    'upload.titleField': 'Título',
    'upload.description': 'Descripción',
    'upload.author': 'Autor',
    'upload.category': 'Categoría',
    'upload.version': 'Versión',
    'upload.tags': 'Etiquetas (separadas por coma)',
    'upload.start': 'Iniciar carga',
    'upload.queue': 'Cola del lote',
    'upload.empty': 'Todavía no hay archivos en la cola.',
    'upload.summary': 'Resumen',
    'upload.retry': 'Reintentar',
    'search.title': 'Buscar documentos',
    'search.placeholder': 'Busca por título, contenido o metadatos…',
    'search.action': 'Buscar',
    'search.filters': 'Filtros',
    'search.category': 'Categoría',
    'search.author': 'Autor',
    'search.tags': 'Etiquetas',
    'search.empty': 'No encontramos documentos con esos criterios.',
    'search.results': 'resultados',
    'search.previous': 'Anterior',
    'search.next': 'Siguiente',
    'viewer.back': 'Volver a resultados',
    'viewer.metadata': 'Metadatos',
    'viewer.description': 'Descripción',
    'viewer.author': 'Autor',
    'viewer.category': 'Categoría',
    'viewer.filename': 'Archivo',
    'viewer.version': 'Versión',
    'viewer.tags': 'Etiquetas',
    'viewer.checksum': 'SHA-256',
    'viewer.copy': 'Copiar texto',
    'viewer.loading': 'Cargando documento…',
    'viewer.error': 'No se pudo abrir el documento.',
    'status.RECEIVED': 'Recibido',
    'status.PROCESSING': 'Procesando',
    'status.INDEXED': 'Indexado',
    'status.ERROR': 'Error',
  },
  en: {
    'app.name': 'DocuTech',
    'nav.search': 'Search',
    'nav.upload': 'Upload',
    'nav.settings': 'Settings',
    'nav.login': 'Sign in',
    'nav.register': 'Create account',
    'nav.logout': 'Sign out',
    'nav.theme': 'Theme',
    'nav.language': 'Language',
    'apiKeys.title': 'API keys',
    'apiKeys.subtitle': 'Personal keys for programmatic access. They are shown only once.',
    'apiKeys.name': 'Key name',
    'apiKeys.create': 'Create API key',
    'apiKeys.once': 'Copy this key now; it will not be shown again.',
    'apiKeys.copy': 'Copy',
    'apiKeys.empty': 'You have no active API keys.',
    'apiKeys.revoke': 'Revoke',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.loginTitle': 'Sign in',
    'auth.registerTitle': 'Create your account',
    'auth.loginAction': 'Sign in',
    'auth.registerAction': 'Register',
    'auth.noAccount': 'No account yet?',
    'auth.hasAccount': 'Already have an account?',
    'upload.title': 'Upload documents',
    'upload.select': 'Select one or more files',
    'upload.metadata': 'Metadata',
    'upload.titleField': 'Title',
    'upload.description': 'Description',
    'upload.author': 'Author',
    'upload.category': 'Category',
    'upload.version': 'Version',
    'upload.tags': 'Tags (comma separated)',
    'upload.start': 'Start upload',
    'upload.queue': 'Batch queue',
    'upload.empty': 'No files in the queue yet.',
    'upload.summary': 'Summary',
    'upload.retry': 'Retry',
    'search.title': 'Search documents',
    'search.placeholder': 'Search title, content or metadata…',
    'search.action': 'Search',
    'search.filters': 'Filters',
    'search.category': 'Category',
    'search.author': 'Author',
    'search.tags': 'Tags',
    'search.empty': 'No documents match those criteria.',
    'search.results': 'results',
    'search.previous': 'Previous',
    'search.next': 'Next',
    'viewer.back': 'Back to results',
    'viewer.metadata': 'Metadata',
    'viewer.description': 'Description',
    'viewer.author': 'Author',
    'viewer.category': 'Category',
    'viewer.filename': 'File',
    'viewer.version': 'Version',
    'viewer.tags': 'Tags',
    'viewer.checksum': 'SHA-256',
    'viewer.copy': 'Copy text',
    'viewer.loading': 'Loading document…',
    'viewer.error': 'The document could not be opened.',
    'status.RECEIVED': 'Received',
    'status.PROCESSING': 'Processing',
    'status.INDEXED': 'Indexed',
    'status.ERROR': 'Error',
  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(readInitialLang());

  t(key: string, params?: Record<string, string | number>): string {
    const template = DICTIONARIES[this.lang()][key] ?? key;
    if (!params) return template;
    return Object.entries(params).reduce(
      (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
      template,
    );
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('lang', lang);
    } catch {
      // localStorage puede no estar disponible.
    }
  }

  toggle(): void {
    this.setLang(this.lang() === 'es' ? 'en' : 'es');
  }
}

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem('lang');
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // Ignorar.
  }
  return navigator.language.startsWith('es') ? 'es' : 'en';
}
