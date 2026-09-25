<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.vue';
import { decodeQrFrom, decodeQrFromFile, readScannedText } from '../qrScan.js';

const router = useRouter();
const { t } = useI18n();
const video = ref(null);
const fileInput = ref(null);
// starting → live → stopped, or unavailable when the browser cannot give us a camera at all.
const camera = ref('starting');
const cameraProblem = ref('');
const error = ref('');
const checking = ref(false);

const FRAME_INTERVAL = 150;
const canvas = document.createElement('canvas');
let stream = null;
let timer = 0;
let mounted = true;
// Set from the first detection until its outcome is known, so repeated frames cannot navigate twice.
let handling = false;

function cameraErrorMessage(caught) {
  if (caught?.name === 'NotAllowedError' || caught?.name === 'SecurityError') return t('scan.errors.denied');
  if (caught?.name === 'NotFoundError' || caught?.name === 'OverconstrainedError') return t('scan.errors.noCamera');
  if (caught?.name === 'NotReadableError') return t('scan.errors.busy');
  return t('scan.errors.cameraFailed');
}

function stopCamera() {
  clearTimeout(timer);
  timer = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  if (video.value) video.value.srcObject = null;
  if (camera.value !== 'unavailable') camera.value = 'stopped';
}

function cameraUnavailable(message) {
  stopCamera();
  camera.value = 'unavailable';
  cameraProblem.value = message;
}

async function startCamera() {
  error.value = '';
  // Browsers only expose the camera to secure pages, so a plain-HTTP LAN address has no API at all.
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraUnavailable(t(window.isSecureContext ? 'scan.errors.noCameraApi' : 'scan.errors.insecure'));
    return;
  }
  camera.value = 'starting';
  try {
    const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    // The page may have been left, or an image chosen, while the permission prompt was open.
    if (!mounted || camera.value !== 'starting') {
      opened.getTracks().forEach(track => track.stop());
      return;
    }
    stream = opened;
    video.value.srcObject = stream;
    await video.value.play();
    camera.value = 'live';
    scanFrame();
  } catch (caught) {
    if (mounted && camera.value === 'starting') cameraUnavailable(cameraErrorMessage(caught));
  }
}

function scanFrame() {
  timer = 0;
  if (camera.value !== 'live') return;
  const frame = video.value;
  if (frame.readyState >= frame.HAVE_CURRENT_DATA && frame.videoWidth) {
    const text = decodeQrFrom(frame, frame.videoWidth, frame.videoHeight, canvas);
    if (text !== null) {
      handle(text);
      return;
    }
  }
  timer = setTimeout(scanFrame, FRAME_INTERVAL);
}

// Only the decoded UUID is sent anywhere: a read-only lookup that tells a missing item from a present one.
async function handle(text) {
  if (handling) return;
  handling = true;
  stopCamera();
  error.value = '';
  const result = readScannedText(text);
  if (result.error) {
    error.value = t(result.error);
    handling = false;
    return;
  }
  checking.value = true;
  try {
    await api(`/api/items/${result.uuid}`);
    if (mounted) await router.push(`/items/${result.uuid}`);
    return;
  } catch (caught) {
    error.value = caught.message;
  } finally {
    checking.value = false;
  }
  handling = false;
}

async function scanImage(event) {
  const file = event.target.files?.[0];
  // Clearing the input lets the same file be chosen again after a failed attempt.
  event.target.value = '';
  if (!file || handling) return;
  stopCamera();
  error.value = '';
  try {
    const text = await decodeQrFromFile(file);
    if (text === null) error.value = t('scan.errors.noCode');
    else await handle(text);
  } catch (caught) {
    // decodeQrFromFile reports an unreadable image by the key of its message.
    error.value = t(caught.message);
  }
}

onMounted(startCamera);
onBeforeUnmount(() => {
  mounted = false;
  stopCamera();
});
</script>

<template>
  <PageHeader :title="$t('scan.title')" />

  <div class="row justify-content-center">
    <div class="col-12 col-md-8 col-lg-6">
      <section class="card">
        <div class="card-body d-grid gap-3">
          <div
            v-if="camera === 'unavailable'"
            class="alert alert-warning mb-0"
          >
            <h2 class="alert-heading h4">
              {{ $t('scan.unavailable') }}
            </h2>
            <p class="mb-1">
              {{ cameraProblem }}
            </p>
            <p class="mb-0">
              <i18n-t
                keypath="scan.useImage"
                scope="global"
              >
                <template #action>
                  <strong>{{ $t('scan.fromImage') }}</strong>
                </template>
              </i18n-t>
            </p>
          </div>
          <template v-else>
            <video
              v-show="camera !== 'stopped'"
              ref="video"
              class="app-scan-preview"
              :aria-label="$t('scan.preview')"
              muted
              playsinline
            />
            <p
              v-if="camera === 'starting'"
              class="text-secondary text-center mb-0"
            >
              {{ $t('scan.starting') }}
            </p>
            <p
              v-else-if="camera === 'live'"
              class="text-secondary text-center mb-0"
            >
              {{ $t('scan.point') }}
            </p>
          </template>

          <div
            v-if="checking"
            class="d-flex align-items-center justify-content-center gap-2 text-secondary"
            role="status"
          >
            <span
              class="spinner-border spinner-border-sm"
              aria-hidden="true"
            />
            {{ $t('scan.opening') }}
          </div>
          <div
            v-if="error"
            class="alert alert-danger mb-0"
            role="alert"
          >
            {{ error }}
          </div>

          <div class="d-flex flex-wrap gap-2">
            <button
              v-if="camera === 'stopped' && !checking"
              type="button"
              class="btn btn-primary flex-fill"
              @click="startCamera"
            >
              {{ $t('scan.again') }}
            </button>
            <button
              type="button"
              class="btn flex-fill"
              :disabled="checking"
              @click="fileInput.click()"
            >
              {{ $t('scan.fromImage') }}
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="d-none"
              @change="scanImage"
            >
          </div>
          <p class="meta-text mb-0">
            {{ $t('scan.privacy') }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
