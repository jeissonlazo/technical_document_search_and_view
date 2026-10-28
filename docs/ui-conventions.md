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

- **Login:** piloto con `HlmButton` y `HlmInput`.
- **Búsqueda:** resultados extraídos a `app-search-results`; todavía usa `.btn`/`.input` propios.
- **Carga, visor y ajustes:** pendientes de migración.

## Orden de migración

1. `HlmButton` y `HlmInput` en Login y Register.
2. `HlmCard`, `HlmBadge` y `HlmSkeleton` en búsqueda y carga.
3. `HlmSelect`, `HlmCheckbox` y `HlmPagination` en filtros y resultados.
4. `HlmTable` en claves API si la tabla crece.
5. `HlmDialog`, `HlmSheet` y `HlmTabs` solo si cambia el patrón de interacción.

Cada paso debe conservar comportamiento, accesibilidad y resultados de búsqueda; la migración es visual y estructural, no una reescritura funcional.
