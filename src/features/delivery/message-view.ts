import { html, nothing } from "lit-html";
import type { DeliveryViewInput } from "./view-contracts.ts";
import { formatCoachingTime } from "./view-contracts.ts";
import type { Thread } from "./contracts.ts";
function messageText(body: string) {
    return body.split(/(https:\/\/[^\s<]+)/g).map(part => {
        if (!part.startsWith("https://"))
            return part;
        try {
            const url = new URL(part);
            return url.protocol === "https:" && !url.username && !url.password ? html `<a href=${url.href} target="_blank" rel="noopener noreferrer">${part}</a>` : part;
        }
        catch {
            return part;
        }
    });
}
export function conversation(input: DeliveryViewInput, thread: Thread | null | undefined, community: boolean) {
    const { state: m, propose } = input, access = m.mentor ? m.detail?.client.membership : m.member?.membership, allowed = community ? m.mentor || m.member?.membership?.active : access?.active && access.level === "individual";
    return html `<section class="mp-panel dv-conversation"><div><h3>${community ? "EBS community" : "Coaching messages"}</h3><p class="mp-muted">${community ? "Share your wins, ask questions and learn with the group. Keep private health details in your private coaching conversations." : m.mentor ? "Read the client’s update and respond with a clear next action." : "Keep your coach updated. Share clear questions, context and training-video links."}</p></div>
 ${thread?.nextCursor ? html `<button class="mp-link" ?disabled=${!!m.pending} @click=${() => propose({ kind: "older" })}>Load earlier ${community ? "posts" : "messages"}</button>` : nothing}
 <div class="dv-messages" aria-label=${community ? "Community posts" : "Conversation"}>${thread?.messages.map(message => html `<article class="dv-message ${message.own ? "dv-message-own" : ""}"><header><strong>${message.author}</strong>${message.fromMentor ? html `<span class="mp-tag">Mentor</span>` : nothing}<time>${formatCoachingTime(message.createdAt)}</time></header><p>${messageText(message.body)}</p></article>`)}${!thread?.messages.length ? html `<p class="mp-muted">${community ? "Start the conversation with a win, question or useful observation." : "Your conversation will appear here."}</p>` : nothing}</div>
 ${allowed ? html `<form class="mp-form" @submit=${(e: SubmitEvent) => { e.preventDefault(); propose({ kind: "send", requestId: crypto.randomUUID() }); }}><fieldset ?disabled=${!!m.pending || !!m.retry}><label class="mp-field">${community ? "Your post" : "Your message"}<textarea rows="4" maxlength="6000" required placeholder=${community ? "A win, a question or something you have learned…" : m.mentor ? "Feedback, next steps or a focused question…" : "What would you like your coach to know?"} .value=${m.message} @input=${(e: Event) => propose({ kind: "message", value: (e.target as HTMLTextAreaElement).value })}></textarea></label><div class="mp-actions"><button class="mp-button">${m.pending?.kind === "write" ? "Sending…" : community ? "Post to community" : "Send message"}</button>${m.message ? html `<button class="mp-link" type="button" @click=${() => propose({ kind: "clear" })}>Clear draft</button>` : nothing}</div></fieldset></form>` : html `<p class="mp-muted">${community ? "Your coach will enable community access when your membership is confirmed." : "Direct messaging is available with active individual access. Group members can use the EBS community. Earlier messages stay in your account."}</p>`}</section>`;
}
