# Wix Integration for Virtual Staging App.AI

This guide shows how to wire a Wix (Velo) site to the serverless endpoints exposed by this repository so that customers can upload a photo, choose staging options, preview the watermarked result, pay for the final asset, and download the unwatermarked render after payment.

## Overview of the Flow

1. **Upload & Stage** – The Wix page collects the base64 image, room type, and style, and calls `POST /api/stage`. The backend stores the original and preview images in Dropbox and triggers the Virtual Staging API (VSAI).
2. **Preview Display** – The handler responds with the Dropbox preview URL (watermarked) along with the `job_id` and `render_id`. Store these values in your Wix database collection (e.g., `VirtualStagingJobs`).
3. **Checkout** – Use `POST /api/checkout` to create a Stripe Checkout session. Include the `job_id` and `render_id` in the metadata so you can resume after payment.
4. **Finalize After Payment** – Once Stripe confirms the payment (via webhook or success page), call `POST /api/finalize` with the stored `job_id` and `render_id`. The backend asks VSAI for an unwatermarked variation, saves it to Dropbox, and returns a direct download URL.
5. **Customer Download** – Display the Dropbox download URL to the customer. Because the final asset is uploaded to Dropbox without a watermark, customers can retrieve the high-resolution output immediately after payment.

## Backend (Velo) Code

Create a new backend web module at `backend/virtualStaging.jsw` and paste the following code. Replace `BASE_API_URL` with the deployed base URL of this repository (for local testing you can use ngrok or similar).

```js
// backend/virtualStaging.jsw
import { fetch } from 'wix-fetch';

const BASE_API_URL = 'https://YOUR_DEPLOYMENT_URL';

function withJson(response) {
  if (!response.ok) {
    return response.json().then((error) => Promise.reject(error));
  }
  return response.json();
}

export function getRoomAndStyleOptions() {
  return fetch(`${BASE_API_URL}/api/options`, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
    },
  }).then(withJson);
}

export function stageImage({ imageBase64, roomType, style }) {
  return fetch(`${BASE_API_URL}/api/stage`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      room_type: roomType,
      style,
    }),
  }).then(withJson);
}

export function createCheckoutSession({ amount, currency, customerEmail, jobId, renderId }) {
  return fetch(`${BASE_API_URL}/api/checkout`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      customer_email: customerEmail,
      metadata: {
        job_id: jobId,
        render_id: renderId,
      },
    }),
  }).then(withJson);
}

export function finalizeRender({ jobId, renderId }) {
  return fetch(`${BASE_API_URL}/api/finalize`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_id: jobId,
      render_id: renderId,
    }),
  }).then(withJson);
}
```

## Front-End (Page) Code

On the staging page, add the following elements with matching IDs:

| Element | ID | Notes |
|---------|----|-------|
| File Upload Button | `#uploadButton` | Set to accept images; use `wix-data` to store the returned metadata. |
| Dropdown | `#roomTypeDropdown` | Populated with room types from the backend. |
| Dropdown | `#styleDropdown` | Populated with styles from the backend. |
| Button | `#stageButton` | Triggers the staging request. |
| Image | `#previewImage` | Displays the watermarked preview. |
| Button | `#checkoutButton` | Launches Stripe Checkout. Disabled until preview is ready. |
| Button | `#downloadButton` | Reveals final download link after payment. Initially hidden. |

Add this code to the page (`$w.onReady`):

```js
// public/pages/staging.js
import { stageImage, getRoomAndStyleOptions, createCheckoutSession, finalizeRender } from 'backend/virtualStaging';
import wixLocation from 'wix-location';
import wixData from 'wix-data';

const COLLECTION_NAME = 'VirtualStagingJobs';

let activeJob = null;

$w.onReady(async function () {
  await loadOptions();
  setupEventHandlers();
});

async function loadOptions() {
  try {
    const { styles = [], roomTypes = [] } = await getRoomAndStyleOptions();
    $w('#roomTypeDropdown').options = roomTypes.map((value) => ({ label: value, value }));
    $w('#styleDropdown').options = styles.map((value) => ({ label: value, value }));
  } catch (error) {
    console.error('Failed to load options', error);
  }
}

function setupEventHandlers() {
  $w('#stageButton').onClick(async () => {
    const file = $w('#uploadButton').value?.[0];
    if (!file) {
      console.warn('No file selected');
      return;
    }

    const roomType = $w('#roomTypeDropdown').value;
    const style = $w('#styleDropdown').value;
    if (!roomType || !style) {
      console.warn('Room type and style are required');
      return;
    }

    const base64 = await file.getFileData();
    const imageBase64 = `data:${file.fileType};base64,${base64}`;

    try {
      $w('#stageButton').disable();
      const result = await stageImage({ imageBase64, roomType, style });
      activeJob = result;

      $w('#previewImage').src = result.preview_url;
      $w('#checkoutButton').enable();

      await wixData.save(COLLECTION_NAME, {
        title: result.job_id,
        jobId: result.job_id,
        renderId: result.render_id,
        previewUrl: result.preview_url,
        previewVsaiUrl: result.preview_vsai_url,
        originalDropboxPath: result.dropbox_path,
        previewDropboxPath: result.preview_dropbox_path,
        roomType,
        style,
      });
    } catch (error) {
      console.error('Failed to stage image', error);
    } finally {
      $w('#stageButton').enable();
    }
  });

  $w('#checkoutButton').onClick(async () => {
    if (!activeJob) {
      return;
    }

    try {
      $w('#checkoutButton').disable();
      const session = await createCheckoutSession({
        amount: 2999, // cents
        currency: 'usd',
        customerEmail: wixLocation.query.email,
        jobId: activeJob.job_id,
        renderId: activeJob.render_id,
      });
      wixLocation.to(session.url);
    } catch (error) {
      console.error('Checkout failed', error);
    } finally {
      $w('#checkoutButton').enable();
    }
  });

  $w('#downloadButton').onClick(() => {
    if (activeJob?.download_url) {
      wixLocation.to(activeJob.download_url);
    }
  });
}

export async function finalizeOrder(jobId, renderId) {
  const result = await finalizeRender({ jobId, renderId });
  activeJob = { ...activeJob, ...result };
  $w('#downloadButton').label = 'Download Final Image';
  $w('#downloadButton').show();
  return result;
}
```

> **Tip:** Call `finalizeOrder(jobId, renderId)` from your Stripe webhook handler or success page once you confirm the payment succeeded.

## Stripe Webhook (Optional)

If you use the Stripe webhook (`/api/stripe-webhook`) already in this project, ensure you forward the `job_id` and `render_id` stored in the Checkout session metadata to Wix. You can invoke `finalizeRender` from the Wix backend using `wix-fetch` when the payment succeeds.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DROPBOX_ACCESS_TOKEN` | Dropbox API token with access to the app folder used for renders. |
| `VSAI_API_KEY` | Virtual Staging App.AI API key. |
| `STRIPE_SECRET_KEY` | Stripe secret key for the Checkout session. |
| `WIX_SITE_URL` | Base URL of your Wix site (used by `/api/checkout`). |

With this setup, Wix users can upload photos, preview staged rooms, pay for the final asset, and download the unwatermarked render automatically.
