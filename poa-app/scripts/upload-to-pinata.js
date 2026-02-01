#!/usr/bin/env node
const { PinataSDK } = require("pinata");
const fs = require("fs");
const path = require("path");

async function uploadDirectory() {
  // Validate required environment variables
  if (!process.env.PINATA_JWT) {
    throw new Error("PINATA_JWT environment variable is required");
  }
  if (!process.env.PINATA_GATEWAY) {
    throw new Error("PINATA_GATEWAY environment variable is required");
  }

  const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY,
  });

  const outDir = "./out";

  // Validate build output exists
  if (!fs.existsSync(outDir)) {
    throw new Error(`Build output directory '${outDir}' does not exist. Did the build fail?`);
  }

  // Collect all files from the out directory
  function getAllFiles(dir, baseDir = dir) {
    const files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...getAllFiles(fullPath, baseDir));
      } else {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({ path: relativePath, fullPath });
      }
    }
    return files;
  }

  const files = getAllFiles(outDir);
  if (files.length === 0) {
    throw new Error(`No files found in '${outDir}'. Build output appears to be empty.`);
  }
  console.log(`Found ${files.length} files to upload`);

  // Create File objects for upload
  const fileObjects = files.map(({ path: relativePath, fullPath }) => {
    const content = fs.readFileSync(fullPath);
    return new File([content], relativePath);
  });

  // Upload as a folder
  const upload = await pinata.upload.public.fileArray(fileObjects);

  console.log("Upload successful!");
  console.log(`CID: ${upload.cid}`);

  // Write outputs for GitHub Actions
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `ipfs_hash=${upload.cid}\n`);
  }
}

uploadDirectory().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
