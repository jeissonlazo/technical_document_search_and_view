# Convención UI y Spartan NG

## Versiones verificadas

- Angular 22.
- `@spartan-ng/brain` 1.8.3.
- `@spartan-ng/cli` 1.8.3.
- Tailwind CSS 4.
- Peer dependencies de Spartan: Angular `>=21 <23`, por lo que Angular 22 es compatible.

## Dos capas de Spartan

1. **Brain** (`@spartan-ng/brain`): primitivas sin estilos, accesibilidad y comportamiento. Se consumen como directivas (`BrnInput`, `BrnButton`, etc.).
2. **Helm** (componentes generados en el proyecto): código fuente copiado a `frontend/src/app/shared/ui`. Aporta estilos, variantes y la API pública `hlm-*`.

Los componentes Helm **no se importan desde node_modules**. Se generan con el CLI y quedan versionados en el repositorio.

## Ubicación e imports

```text
frontend/src/app/shared/ui/
  button/src/lib/hlm-button.ts
  input/src/lib/hlm-input.ts
  textarea/src/lib/hlm-textarea.ts
  card/src/lib/hlm-card.ts
  badge/src/lib/hlm-badge.ts
  combobox/src/lib/hlm-combobox.ts
  table/src/lib/hlm-table.ts
  progress/src/lib/hlm-progress.ts
  utils/src/lib/hlm.ts
```

Alias configurados en `frontend/tsconfig.json`:

```ts
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';
```

`provideSpartanHlm()` está registrado en `frontend/src/app/app.config.ts`.

## Convenciones

### Componentes Helm

- Directivas con selector de atributo: `hlmBtn`, `hlmInput`.
- Clases Angular con prefijo `Hlm`: `HlmButton`, `HlmInput`.
- Usar variantes e inputs de Helm antes que clases visuales propias:
  - `variant="default"`, `variant="outline"`, `variant="ghost"`, `variant="destructive"`.
  - `size="sm"`, `size="default"`, `size="lg"`, `size="icon"`.
- Tailwind se reserva para **layout y composición**: `w-full`, `mt-2`, `flex`, grid, espaciado.
- No mezclar `.btn` o `.input` con `hlmBtn`/`hlmInput` en componentes migrados.
- No usar directamente `@spartan-ng/brain` en una pantalla si ya existe el Helm equivalente.

### Componentes de producto

- Prefijo `app-`: `app-search-results`, `app-document-icon`.
- Se crean solo cuando hay una responsabilidad de producto o se reutilizan en más de una pantalla.
- No envolver cada etiqueta o línea de metadatos en un componente.

### Tokens de tema

`frontend/src/styles.css` mantiene las variables propias de la app (`--surface`, `--fg`, `--accent`, etc.) y las expone a Helm mediante `@theme`:

```css
@theme {
  --color-primary: var(--accent);
  --color-background: var(--surface);
  --color-foreground: var(--fg);
  --color-border: var(--border);
}
```

Así los componentes Helm respetan el tema claro/oscuro existente sin duplicar una paleta.

## Generar nuevos componentes

Desde `frontend/`:

```bash
pnpm exec ng g @spartan-ng/cli:ui --name=button --directory=src/app/shared/ui
pnpm exec ng g @spartan-ng/cli:ui --name=input --directory=src/app/shared/ui
```

El generador actualiza `components.json` y los paths de `tsconfig.json`. Revisar el diff: puede actualizar dependencias compartidas.

## Estado de adopción

- **Login:** `HlmButton` y `HlmInput`.
- **Búsqueda:** resultados extraídos a `app-search-results` y `app-document-icon`; los controles propios siguen pendientes.
- **Carga:** dividida en `app-upload-dropzone`, `app-upload-metadata-form` y `app-upload-queue`; usa `HlmCard`, `HlmBadge`, `HlmInput`, `HlmTextarea`, `HlmButton`, `HlmProgress` y `app-category-combobox` (Combobox múltiple con chips; las categorías se persisten como `string[]`).
- **Visor:** dividido en `app-viewer-header`, `app-viewer-outline` y `app-viewer-metadata`; usa `HlmCard`, `HlmBadge` y `HlmButton`. Los renderers PDF/DOCX permanecen especializados.
- **Ajustes:** dividido en `app-api-key-form` y `app-api-key-table`; usa `HlmCard`, `HlmInput`, `HlmButton` y `HlmTable`.

## Fragmentación por feature

```text
features/upload/components/
  upload-dropzone.component.ts
  upload-metadata-form.component.ts
  upload-queue.component.ts
  category-combobox.component.ts

features/viewer/
  viewer-header.component.ts
  viewer-outline.component.ts
  viewer-metadata.component.ts
  viewer.models.ts

features/settings/components/
  api-key-form.component.ts
  api-key-table.component.ts
```

La pantalla conserva el estado y las llamadas al API; los componentes hijos reciben datos y emiten eventos. No se comparten servicios de feature desde los hijos.

## Orden de migración

1. `HlmButton` y `HlmInput` en Login y Register.
2. `HlmCard`, `HlmBadge` y `HlmSkeleton` en búsqueda y carga.
3. `HlmSelect`, `HlmCheckbox` y `HlmPagination` en filtros y resultados.
4. `HlmTable` en claves API si la tabla crece.
5. `HlmDialog`, `HlmSheet` y `HlmTabs` solo si cambia el patrón de interacción.

Cada paso debe conservar comportamiento, accesibilidad y resultados de búsqueda; la migración es visual y estructural, no una reescritura funcional.
