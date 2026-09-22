<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.vue';
import { decodeQrFrom, decodeQrFromFile, readScannedText } from '../qrScan.js';

const router = useRouter();
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
  if (caught?.name === 'NotAllowedError' || caught?.name === 'SecurityError') return 'Camera access was denied.';
  if (caught?.name === 'NotFoundError' || caught?.name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (caught?.name === 'NotReadableError') return 'The camera is being used by another application.';
  return 'The camera could not be started.';
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
    cameraUnavailable(window.isSecureContext
      ? 'This browser does not offer camera access.'
      : 'The live camera only works when the application is opened over HTTPS or on localhost.');
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
    error.value = result.error;
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
    if (text === null) error.value = 'No QR code was found in this image.';
    else await handle(text);
  } catch (caught) {
    error.value = caught.message;
  }
}

onMounted(startCamera);
onBeforeUnmount(() => {
  mounted = false;
  stopCamera();
});
</script>

<template>
  <PageHeader title="Scan QR" />

  <div class="row justify-content-center">
    <div class="col-12 col-md-8 col-lg-6">
      <section class="card">
        <div class="card-body d-grid gap-3">
          <div
            v-if="camera === 'unavailable'"
            class="alert alert-warning mb-0"
          >
            <h2 class="alert-heading h4">
              Camera unavailable
            </h2>
            <p class="mb-1">
              {{ cameraProblem }}
            </p>
            <p class="mb-0">
              You can still use <strong>Scan from image</strong> with a photo or a screenshot of the label.
            </p>
          </div>
          <template v-else>
            <video
              v-show="camera !== 'stopped'"
              ref="video"
              class="app-scan-preview"
              aria-label="Camera preview"
              muted
              playsinline
            />
            <p
              v-if="camera === 'starting'"
              class="text-secondary text-center mb-0"
            >
              Starting the camera…
            </p>
            <p
              v-else-if="camera === 'live'"
              class="text-secondary text-center mb-0"
            >
              Point the camera at an Inventory Atlas label.
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
            Opening the item…
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
              Scan again
            </button>
            <button
              type="button"
              class="btn flex-fill"
              :disabled="checking"
              @click="fileInput.click()"
            >
              Scan from image
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
            Codes are read on this device; camera frames and chosen images are never uploaded.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
