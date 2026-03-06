import { readFileSync } from "fs";
import { basename } from "path";
import { client, getData } from "../api/client";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  txt: "text/plain",
  md: "text/markdown",
};

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export async function uploadLocalFile(filePath: string): Promise<{
  filename: string;
  contentType: string;
  s3Url: string;
}> {
  const filename = basename(filePath);
  const contentType = getMimeType(filename);
  const fileBuffer = readFileSync(filePath);

  const presigned = await getData(
    client.POST("/v3/uploads/presign", {
      body: {
        files: [{ filename, content_type: contentType }],
      },
    }),
  );
  const uploadTarget = presigned.files[0];
  if (!uploadTarget)
    throw new Error("Upload target was not returned by Are.na");

  const putResponse = await fetch(uploadTarget.upload_url, {
    method: "PUT",
    headers: { "Content-Type": uploadTarget.content_type },
    body: fileBuffer,
  });

  if (!putResponse.ok) {
    throw new Error(`Upload failed (${putResponse.status})`);
  }

  return {
    filename,
    contentType: uploadTarget.content_type,
    s3Url: `https://s3.amazonaws.com/arena_images-temp/${uploadTarget.key}`,
  };
}
