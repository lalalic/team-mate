import assert from "node:assert/strict"
import { sanitizeMeetingFileName, buildMeetingDownloadPaths } from "../src/meeting-files.js"

assert.equal(sanitizeMeetingFileName(' Phoenix / launch: review? '), 'Phoenix _ launch_ review_')

const paths = buildMeetingDownloadPaths('Phoenix Sync', new Date('2026-09-30T12:00:00Z'))
assert.deepEqual(paths, {
    folder: 'MeetMate/Phoenix Sync',
    transcript: 'MeetMate/Phoenix Sync/Phoenix Sync-20260930.vtt',
    report: 'MeetMate/Phoenix Sync/Phoenix Sync-20260930-report.md',
})
assert.ok(!paths.transcript.includes('meeting join'))
assert.ok(!paths.report.includes('meeting join'))

console.log('meeting file path tests passed')
