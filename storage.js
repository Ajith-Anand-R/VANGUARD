import fs from 'fs';
import path from 'path';
import os from 'os';

// Define the writable directory in the system temp folder
// We use a subdirectory to keep things organized
const TMP_DIR = path.join(os.tmpdir(), 'vanguard_data');
const SEED_DATA_DIR = './data';
const SEED_LOGS_DIR = './logs';

/**
 * Ensures the temporary data directory exists and is populated with seed data.
 * This must be called at server startup.
 */
export function initializeStorage() {
    console.log(`[STORAGE] Initializing storage at: ${TMP_DIR}`);

    // Create the main temp directory if it doesn't exist
    if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
    }

    // Create subdirectories
    const dataDir = path.join(TMP_DIR, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    // Logs directory might be needed too
    const logsDir = path.join(TMP_DIR, 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }

    // Copy seed files from ./data to TMP_DIR/data if they don't exist in temp
    copySeedFiles(SEED_DATA_DIR, dataDir);

    // Ensure log file exists
    const decisionsLogPath = path.join(logsDir, 'decisions.log.json');
    if (!fs.existsSync(decisionsLogPath)) {
        // initialize empty log if not present
        fs.writeFileSync(decisionsLogPath, JSON.stringify([], null, 2));
    } else {
        // If we wanted to preserve logs across cold starts we'd need external storage.
        // For now, we accept that logs might be reset if the container is recycled 
        // and we rely on the container reusing the same temp dir if it's warm.
        // But if we want to reset logs on every "deployment" but keep them during a session, 
        // we might check if we should overwrite. For now, rely on existence check.
    }
}

function copySeedFiles(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) return;

    const files = fs.readdirSync(sourceDir);
    files.forEach(file => {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);

        if (fs.lstatSync(sourcePath).isFile()) {
            if (!fs.existsSync(targetPath)) {
                // Copy file
                try {
                    fs.copyFileSync(sourcePath, targetPath);
                    console.log(`[STORAGE] Copied seed file: ${file}`);
                } catch (err) {
                    console.error(`[STORAGE] Failed to copy seed file ${file}:`, err);
                }
            } else {
                // File exists in temp, we assume it's the current state.
                // NOTE: If we deploy new seed data, this logic won't pick it up unless the filename changes
                // or the temp dir is cleared. Ideally we might want to check timestamps or force copy on deploy.
                // For this demo, assuming "persistence" in temp is desired.
            }
        }
    });
}

/**
 * Get the absolute path for a data file in the writable temp directory.
 * @param {string} filename - e.g. "shipments.json"
 */
export function getDataPath(filename) {
    return path.join(TMP_DIR, 'data', filename);
}

/**
 * Get the absolute path for a log file in the writable temp directory.
 * @param {string} filename - e.g. "decisions.log.json"
 */
export function getLogPath(filename) {
    return path.join(TMP_DIR, 'logs', filename);
}
