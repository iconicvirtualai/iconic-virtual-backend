let dropboxCtorPromise;

async function loadDropboxCtor() {
  if (!dropboxCtorPromise) {
    dropboxCtorPromise = import("dropbox").then((mod) => mod.Dropbox);
  }

  return dropboxCtorPromise;
}

export async function resolveDropbox({ factory, options }) {
  if (factory) {
    return Promise.resolve(factory(options));
  }

  const Dropbox = await loadDropboxCtor();
  return new Dropbox(options);
}

export function toRawDropboxUrl(url) {
  if (typeof url !== "string" || url.length === 0) {
    return "";
  }

  if (url.includes("?raw=1")) {
    return url;
  }

  if (url.includes("?dl=0")) {
    return url.replace("?dl=0", "?raw=1");
  }

  return `${url}${url.includes("?") ? "&" : "?"}raw=1`;
}

export async function ensureSharedLink(dropbox, path) {
  try {
    const created = await dropbox.sharingCreateSharedLinkWithSettings({ path });
    return toRawDropboxUrl(created.result.url);
  } catch (error) {
    const summary = error?.error_summary ?? "";
    const alreadyExists = summary.includes("shared_link_already_exists");

    if (!alreadyExists) {
      throw error;
    }

    const existing = await dropbox.sharingListSharedLinks({
      path,
      direct_only: true,
    });

    const url = existing?.result?.links?.[0]?.url;
    if (!url) {
      throw error;
    }

    return toRawDropboxUrl(url);
  }
}

export async function uploadBuffer(dropbox, { path, contents, mode, autorename = false, mute = false }) {
  return dropbox.filesUpload({
    path,
    contents,
    mode,
    autorename,
    mute,
  });
}
