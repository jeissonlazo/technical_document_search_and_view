import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { HlmComboboxImports } from '@spartan-ng/helm/combobox';
import { I18nService } from '../../core/i18n.service';

const DEFAULT_CATEGORIES = [
  'Arquitectura',
  'API',
  'Backend',
  'Base de datos',
  'DevOps',
  'Documentación',
  'Frontend',
  'Manuales',
  'Pruebas',
  'Seguridad',
];

/**
 * Selector de categorías reutilizable (carga y editor de documentos).
 * Permite elegir varias categorías existentes o escribir una nueva.
 */
@Component({
  selector: 'app-category-combobox',
  standalone: true,
  imports: [HlmComboboxImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Un elemento de componente es inline por defecto; en un formulario apilado
  // eso anula el espaciado vertical entre campos.
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2">
      <label class="text-sm font-medium" [for]="controlId()">
        {{ i18n.t('metadata.category') }}
      </label>

      <hlm-combobox-multiple
        [(value)]="categories"
        [search]="search()"
        (searchChange)="search.set($event)"
        [closeOnSelect]="false"
      >
        <hlm-combobox-chips class="w-full">
          <ng-template hlmComboboxValues let-values>
            @for (value of values; track value) {
              <hlm-combobox-chip [value]="value">{{ value }}</hlm-combobox-chip>
            }
          </ng-template>

          <input
            hlmComboboxChipInput
            [id]="controlId()"
            [placeholder]="i18n.t('metadata.categoryPlaceholder')"
            (keydown.enter)="addFromInput($event)"
          />
        </hlm-combobox-chips>

        <hlm-combobox-content *hlmComboboxPortal>
          <hlm-combobox-empty>{{ i18n.t('metadata.categoryEmpty') }}</hlm-combobox-empty>

          <div hlmComboboxList>
            @for (option of options(); track option) {
              <hlm-combobox-item [value]="option">{{ option }}</hlm-combobox-item>
            }
            @if (customCategory(); as custom) {
              <hlm-combobox-item [value]="custom">
                {{ i18n.t('metadata.useCategory') }} «{{ custom }}»
              </hlm-combobox-item>
            }
          </div>
        </hlm-combobox-content>
      </hlm-combobox-multiple>

      <p class="text-xs muted">
        {{ i18n.t('metadata.categoryHint') }} · {{ categories().length }}
        {{ i18n.t('metadata.categoriesSelected') }}
      </p>
    </div>
  `,
})
export class CategoryComboboxComponent {
  readonly i18n = inject(I18nService);

  readonly categories = model<string[]>([]);
  readonly available = input<string[]>(DEFAULT_CATEGORIES);
  /** Identificador del input; debe ser único por pantalla. */
  readonly controlId = input('category-combobox');
  readonly search = signal('');

  readonly options = computed(() => {
    const selected = this.categories();
    return Array.from(
      new Set([...this.available(), ...selected].map((option) => option.trim()).filter(Boolean)),
    );
  });

  readonly customCategory = computed(() => {
    const value = this.search().trim();
    if (!value) return null;
    return this.options().some((option) => option.toLowerCase() === value.toLowerCase()) ? null : value;
  });

  addFromInput(event: Event): void {
    const value = this.search().trim();
    if (!value) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const existing = this.options().find(
      (option) => option.toLowerCase() === value.toLowerCase(),
    );
    const category = existing ?? value;

    if (!this.categories().some((item) => item.toLowerCase() === category.toLowerCase())) {
      this.categories.update((items) => [...items, category]);
    }

    this.search.set('');
  }
}
