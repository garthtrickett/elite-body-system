import { html, nothing } from "lit-html";
import { mediaSource } from "./contracts.ts";
export function video(url: string, title: string) {
    const source = mediaSource(url);
    return source ? source.kind === "frame" ? html `<iframe class="sf-video" src=${source.url} title=${title} loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>` : html `<video class="sf-video" src=${source.url} controls preload="metadata" aria-label=${title}></video>` : nothing;
}
export function publicHeader(input: Readonly<{
    bookingOnly?: boolean;
}> = {}) { return html `<header class="sf-header"><a href="/free-value" aria-label="Elite Body System"><img src="/assets/sales/logo.png" alt="Elite Body System by Harry Baldwin"></a><nav aria-label="Sales pages">${input.bookingOnly ? html `<a href="/book-call">Your booking</a>` : html `<a href="/free-value">Free value</a><a href="/apply">Apply</a><a href="/book-call">Book a call</a>`}</nav></header>`; }
