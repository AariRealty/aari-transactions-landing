-- Decision 117 (12 Oct 2026, Marlenyi: 3 to 5 business days, same as Aari Realty).
-- RAA-2026-04 updated in place (no associate has signed it). Keeps the signed PDF template equal to the live page.
update agreement_templates
set body = replace(body, 'disbursed within five (5) business days after the later of', 'disbursed within three (3) to five (5) business days after the later of'),
    updated_at = now()
where agreement_type = 'referral_associate' and version = 'RAA-2026-04'
  and body like '%disbursed within five (5) business days after the later of%';
select version, position('three (3) to five (5) business days after the later of' in body) > 0 as updated from agreement_templates where version = 'RAA-2026-04';
