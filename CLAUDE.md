# CLAUDE.md

## AI tool used

Claude, used conversationally for a deployment-debugging session after the app was already built and running locally. I pasted real errors and logs and worked through each one step by step rather than asking for a rewrite.

## 1. Render build/start command mismatch

My initial deploy to Render failed — the build and start commands didn't match how the backend was actually structured, so the server never came up. I pasted the Render build log showing the failure, and we corrected the build/start commands in the Render service settings to match the real project structure. After that, the deploy succeeded and the server started correctly.

## 2. CORS blocking frontend → backend requests

Once my frontend (Vercel) and backend (Render) were both live on separate domains, requests from the deployed frontend were blocked by CORS. I reported the CORS error straight from the browser console after testing the live frontend. We updated the backend's CORS configuration to explicitly allow the deployed Vercel origin instead of only localhost, and the frontend could reach the backend in production after that.

## 3. `extracted is not defined` ReferenceError

A runtime crash hit in my document-processing code, referencing a variable called `extracted` that wasn't properly declared or assigned in scope. I pasted the exact stack trace from the Render logs. We traced it to where the variable was being used before it was properly set, and fixed the assignment. The crash stopped, and document extraction started completing instead of throwing immediately.

## 4. Post-extraction processing failure — still unresolved

After fixing the crash above, I uploaded a real test document (26 pages) and it extracted successfully, but the document status still ends up as "Failed" instead of "Ready." That means the failure is now downstream of extraction — most likely in embedding generation (`generateEmbeddingsBatch`) or the database insert (`storeChunks`). My `documents` table has an `error_message` column that the code populates on failure, so my next step is to pull that value from the database or the Render logs to find out whether it's a Gemini API issue (rate limit, missing key, quota) or a schema issue like an embedding column dimension mismatch. I haven't confirmed the root cause yet — this is genuinely still open.
