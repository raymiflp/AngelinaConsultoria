# Delta for Video Calls UI

## LIVEKIT WEBHOOKS ADDITIONS (2026-06-19)

The following requirement is ADDED to the video-calls-ui spec by the `2026-06-19-livekit-webhooks` change. The D10 limitation footer — the "quedará en 'En curso'" confession rendered under the `<LiveKitRoom>` on `src/app/citas/[id]/llamada/page.tsx` — is REMOVED. After this change ships, the call page does NOT display the footer: the auto-complete on `room_finished` webhook (see `video-calls-api/spec.md` REQ-VCA-WH-2) handles the transition end-to-end. The footer text and its existing call-page test assertion are deleted; a "does not render" assertion replaces the "renders" assertion. **D10 is RESOLVED.**

### Requirement: REQ-VCU-WH-1 — Known-Limitation Footer Note (REMOVED)

(Reason: D10 limitation is RESOLVED by `autoCompleteOnRoomFinishedUseCase` per `video-calls-api/spec.md` REQ-VCA-WH-2. The footer was a "we know this is broken" confession; after the webhook ships, the limitation no longer exists.)

(Migration: Delete the `<div>` footer block from `src/app/citas/[id]/llamada/page.tsx` (the text was `"Si ambos salen sin finalizar, la cita quedará en 'En curso' y el doctor deberá cerrarla manualmente desde /citas/${citaId}."`). Delete the existing "footer renders" assertion in `src/app/citas/[id]/llamada/__tests__/page.test.tsx`; add a new "footer does NOT render" assertion in its place. The pre-existing `Known-Limitation Footer Note` requirement in `openspec/specs/video-calls-ui/spec.md` is removed by this delta.)

The call page MUST NOT display the D10 limitation footer in any state (loading, error, or success).

#### Scenario: Footer note is absent from the call page

- GIVEN the call page is rendered in any state (loading / error / success)
- WHEN the DOM is inspected
- THEN no element MUST contain the text `"quedará en 'En curso'"`
- AND the footer block that linked from the call page to `/citas/${citaId}` for manual completion MUST NOT be in the DOM

#### Scenario: Call page test asserts the footer is not rendered

- GIVEN `src/app/citas/[id]/llamada/__tests__/page.test.tsx`
- WHEN the test runs after the change is applied
- THEN a "footer does NOT render" assertion MUST be present (asserts no element contains `"quedará en 'En curso'"`)
- AND the prior "footer renders" assertion MUST be absent (the assertion was deleted, not just inverted)
