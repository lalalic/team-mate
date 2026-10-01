// Pure helpers for meeting export names. Keep these free of Chrome/DOM APIs
// so download-path behavior can be regression-tested directly.

export function sanitizeMeetingFileName(value) {
    const cleaned = String(value || "Meeting")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/[\/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, " ")
        .replace(/^[.\s]+|[.\s]+$/g, "")
        .trim()
    return (cleaned || "Meeting").slice(0, 120)
}

export function buildMeetingDownloadPaths(name, date = new Date()) {
    const safeName = sanitizeMeetingFileName(name)
    const stamp = date.toISOString().split("T")[0].replace(/-/g, "")
    const folder = `MeetMate/${safeName}`
    const base = `${folder}/${safeName}-${stamp}`
    return {
        folder,
        transcript: `${base}.vtt`,
        report: `${base}-report.md`,
    }
}
