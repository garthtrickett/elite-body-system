import { html } from "lit-html";
import { applicationForm } from "./public-view.ts";
import type { PublicViewInput } from "./public-view.ts";
export function applicationPage(input: PublicViewInput) { return html`<div class="sales-page">

<header class="hero">
  <div class="bg" aria-hidden="true"></div>
  <div class="top"><div class="wrap"><img src="/assets/sales/logo.png" alt="Elite Body System by Harry Baldwin"><a class="btn ghost" href="#apply">${input.settings.applicationCopy.copy001}</a></div></div>
  <div class="wrap">
    <span class="tagline sales-inline-1">${input.settings.applicationCopy.copy002}</span>
    <span class="label light">${input.settings.applicationCopy.copy003}</span>
    <h1>${input.settings.applicationCopy.copy004}<em>${input.settings.applicationCopy.copy005}</em>${input.settings.applicationCopy.copy006}</h1>
    <p class="sub">${input.settings.applicationCopy.copy007}</p>
    <div class="row">
      <a class="btn" href="#apply">${input.settings.applicationCopy.copy008}</a>
      <span class="tagline">${input.settings.applicationCopy.copy009}</span>
    </div>
  </div>
</header>

<section class="band">
  <div class="wrap statement">
    <span class="label">${input.settings.applicationCopy.copy010}</span>
    <h2>${input.settings.applicationCopy.copy011}<em>${input.settings.applicationCopy.copy012}</em>${input.settings.applicationCopy.copy013}</h2>
    <p>${input.settings.applicationCopy.copy014}</p>
  </div>
</section>

<section class="band alt">
  <div class="wrap two">
    <div class="prose">
      <span class="label">${input.settings.applicationCopy.copy015}</span>
      <h2>${input.settings.applicationCopy.copy016}<br>${input.settings.applicationCopy.copy017}</h2>
      <p class="muted">${input.settings.applicationCopy.copy018}</p>
    </div>
    <ul class="tried">
      <li><strong>${input.settings.applicationCopy.copy019}</strong><span>${input.settings.applicationCopy.copy020}</span></li>
      <li><strong>${input.settings.applicationCopy.copy021}</strong><span>${input.settings.applicationCopy.copy022}</span></li>
      <li><strong>${input.settings.applicationCopy.copy023}</strong><span>${input.settings.applicationCopy.copy024}</span></li>
    </ul>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <span class="label">${input.settings.applicationCopy.copy025}</span>
    <h2 class="sales-inline-2">${input.settings.applicationCopy.copy026}<em>${input.settings.applicationCopy.copy027}</em>${input.settings.applicationCopy.copy028}</h2>
    <div class="outcomes">
      <div><span class="label">${input.settings.applicationCopy.copy029}</span><h3>${input.settings.applicationCopy.copy030}</h3><p class="muted">${input.settings.applicationCopy.copy031}</p></div>
      <div><span class="label">${input.settings.applicationCopy.copy032}</span><h3>${input.settings.applicationCopy.copy033}</h3><p class="muted">${input.settings.applicationCopy.copy034}</p></div>
      <div><span class="label">${input.settings.applicationCopy.copy035}</span><h3>${input.settings.applicationCopy.copy036}</h3><p class="muted">${input.settings.applicationCopy.copy037}</p></div>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="wrap mentor">
    <img src="/assets/sales/portrait.jpg" alt="Harry Baldwin, founder of the Elite Body System">
    <div class="prose">
      <span class="label">${input.settings.applicationCopy.copy038}</span>
      <h2>${input.settings.applicationCopy.copy039}<em>${input.settings.applicationCopy.copy040}</em>${input.settings.applicationCopy.copy041}</h2>
      <p>${input.settings.applicationCopy.copy042}</p>
      <p class="muted">${input.settings.applicationCopy.copy043}</p>
      <div class="stats">
        <div><b>${input.settings.applicationCopy.copy044}</b><span class="label">${input.settings.applicationCopy.copy045}</span></div>
        <div><b>${input.settings.applicationCopy.copy046}</b><span class="label">${input.settings.applicationCopy.copy047}</span></div>
        <div><b>${input.settings.applicationCopy.copy048}</b><span class="label">${input.settings.applicationCopy.copy049}</span></div>
        <div><b>${input.settings.applicationCopy.copy050}</b><span class="label">${input.settings.applicationCopy.copy051}</span></div>
      </div>
      <p class="sales-inline-3">${input.settings.applicationCopy.copy052}</p>
      <p>${input.settings.applicationCopy.copy053}</p>
      <p>${input.settings.applicationCopy.copy054}</p>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <span class="label">${input.settings.applicationCopy.copy055}</span>
    <h2 class="sales-inline-4">${input.settings.applicationCopy.copy056}<span class="sales-inline-5">${input.settings.applicationCopy.copy057}</span></h2>
    <p class="muted sales-inline-6">${input.settings.applicationCopy.copy058}</p>
    <div class="phases">
      <div class="track" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="track-labels" aria-hidden="true"><span class="label">${input.settings.applicationCopy.copy059}</span><span class="label">${input.settings.applicationCopy.copy060}</span><span class="label">${input.settings.applicationCopy.copy061}</span></div>
      <div class="phase">
        <div class="head"><span class="label">${input.settings.applicationCopy.copy062}</span><h3>${input.settings.applicationCopy.copy063}</h3></div>
        <div class="body"><p class="lead">${input.settings.applicationCopy.copy064}</p><p class="muted">${input.settings.applicationCopy.copy065}</p></div>
      </div>
      <div class="phase">
        <div class="head"><span class="label">${input.settings.applicationCopy.copy066}</span><h3>${input.settings.applicationCopy.copy067}</h3></div>
        <div class="body"><p class="lead">${input.settings.applicationCopy.copy068}</p><p class="muted">${input.settings.applicationCopy.copy069}</p></div>
      </div>
      <div class="phase">
        <div class="head"><span class="label">${input.settings.applicationCopy.copy070}</span><h3>${input.settings.applicationCopy.copy071}</h3></div>
        <div class="body"><p class="lead">${input.settings.applicationCopy.copy072}</p><p class="muted">${input.settings.applicationCopy.copy073}</p></div>
      </div>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="wrap statement">
    <span class="label">${input.settings.applicationCopy.copy074}</span>
    <h2>${input.settings.applicationCopy.copy075}<em>${input.settings.applicationCopy.copy076}</em></h2>
    <div class="quote-slot">
      <p class="q">${input.settings.applicationCopy.copy077}</p>
      <span class="label">${input.settings.applicationCopy.copy078}</span>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <span class="label">${input.settings.applicationCopy.copy079}</span>
    <h2 class="sales-inline-7">${input.settings.applicationCopy.copy080}<em>${input.settings.applicationCopy.copy081}</em>${input.settings.applicationCopy.copy082}</h2>
    <div class="fit">
      <div>
        <span class="label light">${input.settings.applicationCopy.copy083}</span>
        <ul>
          <li>${input.settings.applicationCopy.copy084}</li>
          <li>${input.settings.applicationCopy.copy085}</li>
          <li>${input.settings.applicationCopy.copy086}</li>
        </ul>
        <div class="price"><s class="sales-inline-8" aria-label="was £5,000">${input.settings.applicationCopy.copy087}</s><b>${input.settings.applicationCopy.copy088}</b><span class="label">${input.settings.applicationCopy.copy089}</span></div>
        <span class="label light">${input.settings.applicationCopy.copy090}</span>
      </div>
      <div class="no">
        <span class="label">${input.settings.applicationCopy.copy091}</span>
        <ul>
          <li>${input.settings.applicationCopy.copy092}</li>
          <li>${input.settings.applicationCopy.copy093}</li>
          <li>${input.settings.applicationCopy.copy094}</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="band sales-inline-9" id="guarantee">
  <div class="wrap">
    <div class="g-panel">
      <span class="label">${input.settings.applicationCopy.copy095}</span>
      <h2>${input.settings.applicationCopy.copy096}<em>${input.settings.applicationCopy.copy097}</em></h2>
      <p class="g-cond">${input.settings.applicationCopy.copy098}</p>
      <p class="g-big">${input.settings.applicationCopy.copy099}</p>
      <p class="muted">${input.settings.applicationCopy.copy100}</p>
    </div>
  </div>
</section>

<section class="band alt" id="apply">
  <div class="wrap apply">
    <div class="prose">
      <span class="label">${input.settings.applicationCopy.copy101}</span>
      <h2>${input.settings.applicationCopy.copy102}<em>${input.settings.applicationCopy.copy103}</em>${input.settings.applicationCopy.copy104}</h2>
      <span class="label light">${input.settings.applicationCopy.copy105}</span>
      <p class="muted">${input.settings.applicationCopy.copy106}</p>
      <img src="/assets/sales/hero.jpg" alt="Harry Baldwin, arms crossed, in a garden courtyard">
    </div>
    <div>
      ${applicationForm(input)}
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap close">
    <h2>${input.settings.applicationCopy.copy107}<em>${input.settings.applicationCopy.copy108}</em>${input.settings.applicationCopy.copy109}</h2>
    <a class="btn" href="#apply">${input.settings.applicationCopy.copy110}</a>
  </div>
</section>

<footer><div class="wrap"><span class="label">${input.settings.applicationCopy.copy111}</span><span class="label">${input.settings.applicationCopy.copy112}</span></div></footer>

</div>`; }
