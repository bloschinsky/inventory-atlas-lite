<script setup>
import FieldAutocomplete from './FieldAutocomplete.vue';

/*
  The item values shared by the item form and the template editor, bound to the form state of
  useItemDraftForm. For a template every value is an optional default: the item name may stay empty
  and a yes/no field may stay unset. The default slot sits before the description, for the item's
  container picker.
*/
defineProps({
  categories: { type: Array, required: true },
  fields: { type: Array, required: true },
  template: { type: Boolean, default: false }
});
const form = defineModel('form', { type: Object, required: true });
const currencies = Intl.supportedValuesOf('currency');
</script>

<template>
  <div class="mb-3">
    <label
      class="form-label"
      for="item-name"
    >{{ template ? $t('templates.itemName') : `${$t('items.fields.name')} *` }}</label><input
      id="item-name"
      v-model="form.name"
      class="form-control"
      :required="!template"
    >
  </div>
  <div class="mb-3">
    <label
      class="form-label"
      for="item-category"
    >{{ $t('items.fields.category') }} *</label><select
      id="item-category"
      v-model="form.category_id"
      class="form-select"
      required
    >
      <option
        value=""
        disabled
      >
        {{ $t('common.selectCategory') }}
      </option><option
        v-for="c in categories"
        :key="c.id"
        :value="c.id"
      >
        {{ c.name }}
      </option>
    </select>
  </div>
  <div class="row">
    <div class="col-md-6 mb-3">
      <label
        class="form-label"
        for="item-condition"
      >{{ $t('items.fields.condition') }}</label><input
        id="item-condition"
        v-model="form.condition"
        class="form-control"
        :placeholder="$t('itemForm.conditionPlaceholder')"
      >
    </div><div class="col-md-6 mb-3">
      <label
        class="form-label"
        for="item-location"
      >{{ $t('items.fields.location') }}</label><input
        id="item-location"
        v-model="form.location"
        class="form-control"
        :placeholder="$t('itemForm.locationPlaceholder')"
      >
      <div
        v-if="form.parent_item_id"
        class="form-text"
      >
        {{ $t('items.inheritedLocation') }} {{ $t('itemForm.ownLocation') }}
      </div>
    </div>
  </div>
  <div class="mb-3">
    <label
      class="form-label"
      for="item-transferred-to"
    >{{ $t('items.fields.transferredTo') }}</label>
    <FieldAutocomplete
      v-model="form.transferred_to"
      input-id="item-transferred-to"
      source="/api/items/transferred-to-suggestions"
      maxlength="255"
      :placeholder="$t('itemForm.transferredToPlaceholder')"
    />
    <div class="form-text">
      {{ $t('itemForm.transferredToHelp') }}
    </div>
  </div>
  <div class="row">
    <div class="col-md-6 mb-3">
      <label
        class="form-label"
        for="item-purchase-date"
      >{{ $t('items.fields.purchaseDate') }}</label><input
        id="item-purchase-date"
        v-model="form.purchase_date"
        class="form-control"
        type="date"
      >
    </div><div class="col-md-6 mb-3">
      <label
        class="form-label"
        for="item-serial-number"
      >{{ $t('items.fields.serialNumber') }}</label><input
        id="item-serial-number"
        v-model="form.serial_number"
        class="form-control"
        maxlength="255"
      >
      <div
        v-if="template"
        class="form-text"
      >
        {{ $t('templates.serialHint') }}
      </div>
    </div>
  </div>
  <div class="mb-3">
    <label
      class="form-label"
      for="item-purchase-price"
    >{{ $t('items.fields.purchasePrice') }}</label>
    <div class="input-group">
      <input
        id="item-purchase-price"
        v-model="form.purchase_price.amount"
        class="form-control"
        type="text"
        inputmode="decimal"
        pattern="[0-9]+([.][0-9]{1,4})?"
        placeholder="0.00"
      ><select
        v-model="form.purchase_price.currency"
        class="form-select"
        :aria-label="$t('itemForm.currency')"
      >
        <option
          v-for="currency in currencies"
          :key="currency"
          :value="currency"
        >
          {{ currency }}
        </option>
      </select>
    </div>
    <div class="form-text">
      {{ $t('itemForm.priceHelp') }}
    </div>
  </div>
  <slot />
  <div class="mb-3">
    <label
      class="form-label"
      for="item-description"
    >{{ $t('items.fields.description') }}</label><textarea
      id="item-description"
      v-model="form.description"
      class="form-control"
      rows="3"
    />
  </div>
  <template v-if="fields.length">
    <hr>
    <h2 class="card-title mb-3">
      {{ $t('itemForm.categoryFields') }}
    </h2>
    <div
      v-for="field in fields"
      :key="field.id"
      class="mb-3"
    >
      <label
        class="form-label"
        :for="`field-${field.id}`"
      >{{ field.name }}</label>
      <select
        v-if="field.type === 'boolean'"
        :id="`field-${field.id}`"
        v-model="form.field_values[field.id]"
        class="form-select"
      >
        <option
          v-if="template"
          value=""
        >
          {{ $t('templates.notSet') }}
        </option><option value="0">
          {{ $t('common.no') }}
        </option><option value="1">
          {{ $t('common.yes') }}
        </option>
      </select>
      <FieldAutocomplete
        v-else-if="field.type === 'text'"
        v-model="form.field_values[field.id]"
        :input-id="`field-${field.id}`"
        :source="`/api/fields/${field.id}/suggestions`"
      />
      <input
        v-else
        :id="`field-${field.id}`"
        v-model="form.field_values[field.id]"
        class="form-control"
        :type="field.type"
      >
    </div>
  </template>
</template>
