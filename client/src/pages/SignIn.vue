<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../shared/accounts.js';
import { recover, setUp, signIn } from '../auth.js';
import AppBrand from '../components/AppBrand.vue';
import ThemeToggle from '../components/ThemeToggle.vue';

/*
  The three pages open without a session, in one form: signing in, creating the first administrator
  with the setup code from the command line, and setting a new password with a recovery code. After
  success the person continues at the address they first asked for.
*/
const route = useRoute();
const router = useRouter();
const mode = computed(() => route.meta.public);
const form = ref({ username: '', password: '', confirm: '', code: '' });
const error = ref('');
const busy = ref(false);
const codeInput = ref(null);
const usernameInput = ref(null);
const focusFirst = () => (mode.value === 'login' ? usernameInput : codeInput).value?.focus();

const needsConfirm = computed(() => mode.value !== 'login');
const mismatch = computed(() => needsConfirm.value && form.value.confirm !== '' && form.value.confirm !== form.value.password);
const target = () => {
  const redirect = route.query.redirect;
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
};

watch(mode, async () => {
  form.value = { username: form.value.username, password: '', confirm: '', code: '' };
  error.value = '';
  await nextTick();
  focusFirst();
});
onMounted(focusFirst);

async function submit() {
  if (mismatch.value) return;
  busy.value = true;
  error.value = '';
  const { username, password, code } = form.value;
  try {
    if (mode.value === 'setup') await setUp({ code, username, password });
    else if (mode.value === 'recover') await recover({ code, username, password });
    else await signIn({ username, password });
    await router.replace(target());
  } catch (caught) {
    error.value = caught.message;
    form.value.password = '';
    form.value.confirm = '';
  } finally {
    busy.value = false;
  }
}
const otherMode = path => ({ path, query: route.query.redirect ? { redirect: route.query.redirect } : {} });
</script>

<template>
  <div class="page page-center app-sign-in">
    <div class="container container-tight py-4">
      <div class="d-flex align-items-center justify-content-between mb-4">
        <span class="navbar-brand app-brand m-0 p-0">
          <AppBrand />
        </span>
        <ThemeToggle />
      </div>
      <main class="card card-md">
        <form
          class="card-body"
          novalidate
          @submit.prevent="submit"
        >
          <h1 class="h2 mb-2">
            {{ $t(`auth.${mode}.title`) }}
          </h1>
          <p class="text-secondary mb-4">
            {{ $t(`auth.${mode}.help`) }}
          </p>
          <pre
            v-if="mode !== 'login'"
            class="app-sign-in-command"
          ><code>{{ mode === 'setup' ? 'npm run auth -- init' : 'npm run auth -- recover <username>' }}</code></pre>
          <div
            v-if="error"
            class="alert alert-danger"
            role="alert"
          >
            {{ error }}
          </div>
          <div
            v-if="mode !== 'login'"
            class="mb-3"
          >
            <label
              class="form-label"
              for="sign-in-code"
            >{{ $t(mode === 'setup' ? 'auth.setupCode' : 'auth.recoveryCode') }}</label>
            <input
              id="sign-in-code"
              ref="codeInput"
              v-model="form.code"
              class="form-control font-monospace"
              autocomplete="one-time-code"
              autocapitalize="characters"
              spellcheck="false"
              required
            >
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="sign-in-username"
            >{{ $t('auth.username') }}</label>
            <input
              id="sign-in-username"
              ref="usernameInput"
              v-model="form.username"
              class="form-control"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
            >
            <div
              v-if="mode === 'setup'"
              class="form-hint"
            >
              {{ $t('auth.usernameHint') }}
            </div>
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="sign-in-password"
            >{{ $t(mode === 'login' ? 'auth.password' : 'auth.newPassword') }}</label>
            <input
              id="sign-in-password"
              v-model="form.password"
              type="password"
              class="form-control"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              :minlength="mode === 'login' ? undefined : PASSWORD_MIN_LENGTH"
              :maxlength="PASSWORD_MAX_LENGTH"
              required
            >
            <div
              v-if="needsConfirm"
              class="form-hint"
            >
              {{ $t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) }}
            </div>
          </div>
          <div
            v-if="needsConfirm"
            class="mb-3"
          >
            <label
              class="form-label"
              for="sign-in-confirm"
            >{{ $t('auth.confirmPassword') }}</label>
            <input
              id="sign-in-confirm"
              v-model="form.confirm"
              type="password"
              class="form-control"
              :class="{ 'is-invalid': mismatch }"
              autocomplete="new-password"
              :aria-invalid="mismatch ? 'true' : undefined"
              aria-describedby="sign-in-confirm-error"
              required
            >
            <div
              id="sign-in-confirm-error"
              class="invalid-feedback"
            >
              {{ mismatch ? $t('auth.passwordMismatch') : '' }}
            </div>
          </div>
          <button
            type="submit"
            class="btn btn-primary w-100"
            :disabled="busy || !form.username || !form.password || (mode !== 'login' && (!form.code || !form.confirm || mismatch))"
          >
            {{ busy ? $t('auth.working') : $t(`auth.${mode}.submit`) }}
          </button>
        </form>
      </main>
      <div
        v-if="mode !== 'setup'"
        class="text-center text-secondary mt-3"
      >
        <RouterLink
          v-if="mode === 'login'"
          :to="otherMode('/recover')"
        >
          {{ $t('auth.useRecoveryCode') }}
        </RouterLink>
        <RouterLink
          v-else
          :to="otherMode('/login')"
        >
          {{ $t('auth.backToSignIn') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>
