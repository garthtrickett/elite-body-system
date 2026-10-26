// Original draft wording, not an approved legal document or an official PAR-Q form.
// Keep the version and text together so an approval never silently changes signed terms.
export const DRAFT_HEALTH_SAFETY = {
  approved: false,
  consentVersion: "ebs-health-safety-draft-2026-10-26",
  consentText: `Elite Body System — Health & Safety Agreement

1. The service and its limits
Elite Body System is a United States business delivering an online fitness system to clients worldwide. It provides digital exercise programs, instructional material and general education about nutrition, recovery and habits, with remote coaching or technique feedback where included in the service purchased. Exercises and assessments are performed in my own location; buying access does not provide in-person supervision. Self-reported or uploaded assessments help establish a starting point and are not medical examinations or a diagnosis. The system does not replace a physician, physical therapist, registered dietitian or mental-health professional. I will not change prescribed treatment or medication based on its content. Results vary; no particular physique, performance or health outcome is guaranteed.

2. Health disclosure and readiness
I will answer screening questions honestly and disclose conditions, symptoms, injuries, operations, pregnancy or postpartum considerations, medication effects and professional restrictions relevant to safe participation. I will tell Harry promptly if these change. If I am uncertain about a question, I will ask before exercising. A screening answer is not a diagnosis or proof that exercise is safe. A Yes answer requires review before the affected assessments or training; it does not automatically exclude me from coaching. Where medical advice is indicated, clearance and restrictions must come from an appropriately qualified healthcare professional.

3. Informed consent and exercise risks
The program may include mobility work, resistance training, bodyweight movements, cardiovascular exercise and self-recorded assessments. Expected benefits can include improved fitness, strength, movement and confidence. Exercise also has risks, including soreness, strains, falls, joint injury, aggravation of an existing condition, dizziness and fainting. Rare serious events can include a cardiac event, permanent injury or death. Risk depends on my health, preparation, surroundings and activity. Careful instruction and appropriate modifications reduce risk but cannot remove it completely.

4. Voluntary participation and alternatives
I choose whether to start, continue, modify or stop an activity. I may decline a movement or assessment and ask Harry for a suitable alternative. I will not attempt an unsafe movement merely to complete onboarding. I will ask about instructions I do not understand, follow agreed restrictions and avoid increasing intensity beyond the agreed plan. Withdrawing from an activity does not itself cancel my subscription or service contract; payment, digital-access and cancellation rights are governed by the separate service terms and applicable consumer law.

5. Stop rules and emergencies
I will stop exercising for chest pain, fainting, severe or unusual shortness of breath, sudden severe pain or other concerning symptoms. I will seek urgent medical help and call the emergency number where I am if symptoms suggest an emergency. I will not wait for an app response. EBS messages, uploaded videos and coaching calls are not an emergency service or continuous monitoring. An emergency contact helps communication but does not guarantee that EBS can detect an emergency or arrange treatment remotely.

6. Remote training, equipment and recordings
Online delivery does not let EBS inspect my surroundings or continuously observe my exercise. I will use a clear space, appropriate footwear and equipment in good condition, and obtain qualified in-person assistance or a spotter where needed. I will not exercise while impaired by alcohol, drugs or illness that makes exercise unsafe. I will position any camera safely and avoid including other people or private information in submissions. Recorded technique review cannot show every risk, and feedback may arrive after a session rather than during it. A live video connection is not a substitute for physical assistance. I will stop if the setting or connection makes an activity unsafe, and I can request an alternative.

7. Nutrition, body composition and wellbeing
Nutrition coaching is general education unless a separately identified professional is qualified and legally authorised to provide clinical care. I will tell my coach about relevant dietary restrictions or concerns and seek appropriate professional support for a medical condition, pregnancy, an eating disorder or symptoms of one. I do not have to follow advice that conflicts with medical instructions. Progress photos and measurements are for agreed coaching purposes; they are not a requirement to accept unsafe dieting, dehydration or a particular appearance.

8. Assumption of inherent risk, limited release and legal rights
I understand the disclosed inherent risks and choose to participate within my capabilities and agreed restrictions. Only where applicable law allows, I release Elite Body System and its coaches from claims arising solely from those inherent exercise risks where no breach of a legal duty by them caused the harm. This is not a blanket release of liability. Nothing here excludes a duty of care or liability that the law does not allow EBS to exclude, or waives claims for negligence, gross negligence, reckless or intentional misconduct, fraud or breach of mandatory consumer rights. Any broader release must be separately reviewed for the relevant jurisdiction and presented clearly. Clients worldwide retain the mandatory protections of the laws that apply to them. This agreement does not require arbitration, waive a jury or class action, or select a court or governing law.

9. Health information and private assessment media
My health answers, relevant restrictions, measurements, progress photos and assessment videos can reveal sensitive health information. The separate health-data consent below covers their collection, storage and use to screen participation, tailor coaching and review progress, with access by authorised EBS personnel and service providers needed to deliver those functions as described in the privacy notice. This agreement does not authorise selling health information, advertising use, public testimonials, social-media publication or recording an entire coaching call. Those uses require a separate, specific permission where lawful; refusing publicity will not affect coaching.

10. Privacy choices and international clients
Before signing, I must have access to EBS's current privacy notice, identifying its privacy contact, the data collected directly from me or generated during coaching, the purposes and legal grounds for use, recipients and service-provider categories, retention criteria and any relevant international-transfer safeguards. Information is retained only for the coaching purposes and legal obligations explained in that notice, then deleted or de-identified as appropriate; withdrawing consent does not automatically erase records that must lawfully be retained. EBS is based in the United States; any processing outside my country must be explained in the notice and use legally required safeguards. My agreement to fitness participation is not blanket permission for international transfers or new uses of my information.

I may use the EBS contact route supplied with my service to request access, a copy, correction, deletion, restrictions on use, withdrawal of health-data consent or an explanation of any refusal. Applicable law determines the precise rights, exceptions and complaint or appeal routes, including access to my relevant data-protection authority. I can withhold or withdraw consent to future health-data processing; EBS will explain any effect on services that genuinely need that information and discuss alternatives. Refusing publicity or exercising privacy rights does not waive consumer protections. A separate authorisation is needed for any optional sharing that requires its own consent.

11. Adult declaration and electronic acknowledgement
I confirm that I am at least 18, have the legal capacity to enter this agreement where I live and am completing it for myself. I have had an opportunity to read the terms, understand the risks, ask questions and request alternatives. By selecting the participation agreement checkbox and typing my full name, I intend to record my electronic acknowledgement of this version. The health-data consent is a separate choice. I can request a copy of the document and recorded acknowledgement through EBS's contact route. The recorded date and document version identify the terms acknowledged; my signature is not a medical clearance or a statement that all exercise is safe.`,
  parqVersion: "ebs-health-screening-draft-2026-10-26",
  healthQuestions: [
    "Has a healthcare professional told you that you have a heart, circulation or blood-pressure condition, or that you should exercise only under medical supervision?",
    "Do you have chest pain or discomfort, unusual breathlessness, or an unexplained racing or irregular heartbeat at rest or during activity?",
    "Have you had unexplained dizziness, fainting or loss of consciousness, or a balance problem that could make exercise unsafe?",
    "Do you have a diagnosed medical condition, such as diabetes, lung or kidney disease, that may need adjustments or professional advice before exercise?",
    "Do you have an injury, recent surgery, persistent pain, or a bone, joint or muscle problem that exercise could make worse?",
    "Do you take medication, have a recent medication change, or have a healthcare professional's restrictions that may affect exercise safety?",
    "Are you pregnant, recently postpartum, unwell, or aware of any other reason to seek professional advice or a modified assessment before starting this program?",
  ],
} as const;
