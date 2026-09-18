<script setup>
import ItemThumbnail from './ItemThumbnail.vue';

defineProps({ items: { type: Array, required: true } });

// The table and the card list show the same data through the same routes; only the markup differs.
const detailsRoute = item => `/items/${item.id}`;
const editRoute = item => `/items/${item.id}/edit`;
</script>

<template>
  <div class="card d-none d-lg-block">
    <div class="table-responsive">
      <table class="table table-vcenter table-hover card-table">
        <thead>
          <tr>
            <th scope="col">
              Photo
            </th>
            <th
              scope="col"
              class="name-cell"
            >
              Name
            </th>
            <th scope="col">
              Category
            </th>
            <th scope="col">
              Condition
            </th>
            <th
              scope="col"
              class="d-none d-xl-table-cell"
            >
              Location
            </th>
            <th
              scope="col"
              class="d-none d-xl-table-cell"
            >
              Stored inside
            </th>
            <th
              scope="col"
              class="text-end"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
          >
            <td>
              <ItemThumbnail
                :photo-id="item.thumbnail_id"
                :name="item.name"
              />
            </td>
            <td class="name-cell">
              <RouterLink
                :to="detailsRoute(item)"
                class="fw-semibold"
              >
                {{ item.name }}
              </RouterLink>
              <span
                v-if="item.location || item.parent_id"
                class="d-xl-none d-block meta-text"
              >
                <template v-if="item.location">{{ item.location }}</template>
                <template v-if="item.location && item.parent_id"> · </template>
                <template v-if="item.parent_id">
                  Stored inside
                  <RouterLink :to="`/items/${item.parent_id}`">{{ item.parent_name }}</RouterLink>
                </template>
              </span>
            </td>
            <td>{{ item.category_name }}</td>
            <td>{{ item.condition || '—' }}</td>
            <td
              class="truncate-cell d-none d-xl-table-cell"
              :title="item.location || undefined"
            >
              {{ item.location || '—' }}
            </td>
            <td class="truncate-cell d-none d-xl-table-cell">
              <RouterLink
                v-if="item.parent_id"
                :to="`/items/${item.parent_id}`"
                :title="item.parent_name"
              >
                {{ item.parent_name }}
              </RouterLink>
              <template v-else>
                —
              </template>
            </td>
            <td class="text-end text-nowrap">
              <RouterLink
                :to="detailsRoute(item)"
                class="btn btn-sm me-1"
                :aria-label="`View ${item.name}`"
              >
                View
              </RouterLink>
              <RouterLink
                :to="editRoute(item)"
                class="btn btn-sm btn-primary"
                :aria-label="`Edit ${item.name}`"
              >
                Edit
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <ul class="list-unstyled d-lg-none mb-0 d-grid gap-2">
    <li
      v-for="item in items"
      :key="item.id"
      class="card item-card"
    >
      <div class="card-body p-3">
        <div class="d-flex gap-3">
          <ItemThumbnail
            :photo-id="item.thumbnail_id"
            :name="item.name"
            large
          />
          <div class="min-w-0 flex-grow-1">
            <RouterLink
              :to="detailsRoute(item)"
              class="item-card-link"
            >
              {{ item.name }}
            </RouterLink>
            <p class="meta-text mb-0">
              {{ item.category_name }}
            </p>
            <p
              v-if="item.parent_id"
              class="meta-text mb-0"
            >
              Stored inside
              <RouterLink :to="`/items/${item.parent_id}`">
                {{ item.parent_name }}
              </RouterLink>
            </p>
            <p
              v-if="item.condition || item.location"
              class="meta-text mb-0"
            >
              <template v-if="item.condition">
                {{ item.condition }}
              </template>
              <template v-if="item.condition && item.location">
                ·
              </template>
              <template v-if="item.location">
                {{ item.location }}
              </template>
            </p>
          </div>
        </div>
        <div class="d-flex gap-2 mt-3 justify-content-sm-end">
          <RouterLink
            :to="detailsRoute(item)"
            class="btn btn-sm flex-fill flex-sm-grow-0 px-sm-4"
            :aria-label="`View ${item.name}`"
          >
            View
          </RouterLink>
          <RouterLink
            :to="editRoute(item)"
            class="btn btn-sm btn-primary flex-fill flex-sm-grow-0 px-sm-4"
            :aria-label="`Edit ${item.name}`"
          >
            Edit
          </RouterLink>
        </div>
      </div>
    </li>
  </ul>
</template>
