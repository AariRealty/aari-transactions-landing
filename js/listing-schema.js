/* =========================================================================
   Aari Transactions · Listing Schema (single source of truth)
   -------------------------------------------------------------------------
   Drives the listing intake (LC, Listing Docs, MLS Setup) and the portal
   "Complete MLS profile" follow-up task. Property type is the branch point.

   Source: 9 MLS profile sheets parsed May 2026. Field matrix lives at
   MLS_Listing_Intake_Field_Matrix.md in the project root.

   Two surfaces consume this:
   - critical_fields  → asked at intake (chat-style qwiz, 1-2 per screen)
   - sections         → asked in the portal follow-up task after submission

   v1 ships 6 property types. Commercial + Boat Dock are deferred — their
   2018 profile sheets need currency confirmation before wiring.

   Field shape:
     { name, label, type, required, options?, placeholder?, max_chars?,
       depends_on?, min?, max?, format? }

   Types:
     text       single-line text
     textarea   multi-line text
     number     numeric input
     currency   $ formatted, comma separators
     date       ISO date picker
     select     single choice dropdown
     radio      single choice radio pill
     multiselect  multiple selection (checkboxes)
     address    full street address with auto-fill (PID, county, GEO)
     yesno      Yes/No toggle
   ========================================================================= */
(function(global){
  'use strict';

  /* ----- Shared field definitions (re-used across property types) ----- */
  const ADDRESS_FIELD = {
    name: 'property_address',
    label: 'Property address',
    type: 'address',
    required: true,
    placeholder: 'Street, City, FL ZIP',
  };

  const LIST_PRICE = {
    name: 'list_price',
    label: 'List price',
    type: 'currency',
    required: true,
    min: 0,
  };

  const LISTING_TYPE = {
    name: 'listing_type',
    label: 'Listing type',
    type: 'radio',
    required: true,
    options: [
      'Exclusive Right to Sell',
      'Exclusive Right to Sell w/ Exclusions',
      'Exclusive Agency',
      'Exclusive Agency with Exclusions',
      'Limited Services',
    ],
  };

  const LISTING_DATE = {
    name: 'listing_date',
    label: 'Listing date',
    type: 'date',
    required: true,
  };

  const EXPIRATION_DATE = {
    name: 'expiration_date',
    label: 'Listing expiration date',
    type: 'date',
    required: true,
  };

  const SETTLEMENT_AGENT_NAME = {
    name: 'settlement_agent_name',
    label: 'Settlement agent (title/closing) name',
    type: 'text',
    required: true,
  };

  const SETTLEMENT_AGENT_EMAIL = {
    name: 'settlement_agent_email',
    label: 'Settlement agent email',
    type: 'text',
    required: true,
    format: 'email',
  };

  const SETTLEMENT_AGENT_PHONE = {
    name: 'settlement_agent_phone',
    label: 'Settlement agent phone',
    type: 'text',
    required: true,
    placeholder: '(239) 555-0100',
  };

  const SETTLEMENT_AGENT_ADDRESS = {
    name: 'settlement_agent_address',
    label: 'Settlement agent address',
    type: 'text',
    required: false,
    placeholder: 'Office address · used on the MLS profile sheet',
  };

  /* ----- Property-attribute shared constants (residential/sale types) ----- */
  const OWNER_NAME = {
    name: 'owner_name',
    label: 'Owner name (as listed on the deed)',
    type: 'text',
    required: true,
    placeholder: 'Full legal name on the deed of record',
  };

  const BUILDING_DESIGN = {
    name: 'building_design',
    label: 'Building design',
    type: 'radio',
    required: true,
    options: [
      'Single Family',
      'Villa Attached',
      'Villa Detached',
      'Townhouse',
      'Manufactured',
      'Low Rise (1-3)',
      'Mid Rise (4-7)',
      'High Rise (8+)',
    ],
  };

  const STATUS_TYPE = {
    name: 'status_type',
    label: 'Status type',
    type: 'radio',
    required: true,
    options: ['Resale Property', 'New Construction', 'Under Construction', 'Pre-construction'],
    note: 'New / Under / Pre-construction require a County Permit # — TC will follow up.',
  };

  const HOA_YESNO = {
    name: 'hoa',
    label: 'HOA?',
    type: 'yesno',
    required: true,
  };

  const HOA_FEE = {
    name: 'hoa_fee',
    label: 'HOA fee ($)',
    type: 'currency',
    required: false,
    min: 0,
    depends_on: { name: 'hoa', value: 'Yes' },
  };

  const HOA_FREQUENCY = {
    name: 'hoa_frequency',
    label: 'HOA fee frequency',
    type: 'select',
    required: false,
    options: ['Monthly', 'Quarterly', 'Semi-annually', 'Annually'],
    depends_on: { name: 'hoa', value: 'Yes' },
  };

  const PRIVATE_POOL = {
    name: 'private_pool',
    label: 'Private pool?',
    type: 'yesno',
    required: true,
    note: 'Top buyer search filter. Details (heated, salt, screened) captured in portal follow-up.',
  };

  const WATERFRONT = {
    name: 'waterfront',
    label: 'Waterfront?',
    type: 'yesno',
    required: true,
    note: 'Gulf access, canal, lake details captured in portal follow-up.',
  };

  const GARAGE_SPACES = {
    name: 'garage_spaces',
    label: 'Garage spaces',
    type: 'number',
    required: true,
    min: 0,
    max: 10,
    placeholder: '0 if none',
  };

  const SQFT_SOURCE = {
    name: 'sqft_source',
    label: 'Square footage source',
    type: 'select',
    required: true,
    options: [
      'Property Appraiser',
      'Survey',
      'Architectural Plan',
      'Field Measurements',
      'Floor Plan Service',
      'Previous Appraisal',
      'Developer Brochure',
      'Other',
    ],
    note: 'MLS requires a source for living area + lot.',
  };

  /* ----- Condo/Villa-specific shared constants ----- */
  const BUILDING_DESIGN_CONDO = {
    name: 'building_design',
    label: 'Building design',
    type: 'radio',
    required: true,
    options: [
      'Villa Attached',
      'Villa Detached',
      'Townhouse',
      'Low Rise (1-3)',
      'Mid Rise (4-7)',
      'High Rise (8+)',
      'Manufactured',
    ],
  };

  const BUILDING_NUM = {
    name: 'building_num',
    label: 'Building #',
    type: 'text',
    required: false,
    placeholder: 'For multi-building complexes — leave blank if single building',
  };

  const UNIT_FLOOR = {
    name: 'unit_floor',
    label: 'Unit floor',
    type: 'number',
    required: false,
    min: 1,
    max: 100,
    placeholder: 'Only for mid-rise / high-rise',
  };

  const MASTER_HOA_YESNO = {
    name: 'master_hoa',
    label: 'Master HOA (in addition to condo fee)?',
    type: 'yesno',
    required: true,
    note: 'Many SWFL complexes have both a condo fee AND a master HOA. If only one, pick No.',
  };

  const MASTER_HOA_FEE = {
    name: 'master_hoa_fee',
    label: 'Master HOA fee ($)',
    type: 'currency',
    required: false,
    min: 0,
    depends_on: { name: 'master_hoa', value: 'Yes' },
  };

  const MASTER_HOA_FREQUENCY = {
    name: 'master_hoa_frequency',
    label: 'Master HOA fee frequency',
    type: 'select',
    required: false,
    options: ['Monthly', 'Quarterly', 'Semi-annually', 'Annually'],
    depends_on: { name: 'master_hoa', value: 'Yes' },
  };

  /* ----- Multi-family · cap-rate companion to gross income ----- */
  const ANNUAL_EXPENSES = {
    name: 'annual_expenses',
    label: 'Annual operating expenses ($)',
    type: 'currency',
    required: true,
    min: 0,
    note: 'Taxes, insurance, maintenance, management. Pairs with gross income for cap rate.',
  };

  /* ----- Lot/Land-specific shared constants ----- */
  const ELEVATION = {
    name: 'elevation',
    label: 'Elevation (above sea level)',
    type: 'radio',
    required: true,
    options: ['0–5 ft', '5–10 ft', '10–15 ft', '15–20 ft', '20+ ft'],
    note: 'Drives flood zone determination — critical in SWFL.',
  };

  const NUM_PARCELS = {
    name: 'num_parcels',
    label: 'Number of parcels',
    type: 'number',
    required: true,
    min: 1,
    max: 50,
    placeholder: '1 for single lot · more for double lot deals',
  };

  /* ----- Rental-specific shared constants ----- */
  const APPLICATION_FEE = {
    name: 'application_fee',
    label: 'Application fee ($)',
    type: 'currency',
    required: true,
    min: 0,
    note: 'Background + credit check fee charged per applicant.',
  };

  const RENTAL_MANAGEMENT_CO = {
    name: 'rental_management_co',
    label: 'Rental management company',
    type: 'text',
    required: false,
    placeholder: 'Leave blank if self-managed by owner',
  };

  const MONTHLY_RATE = {
    name: 'rent_monthly',
    label: 'Monthly rate ($)',
    type: 'currency',
    required: false,
    min: 0,
    note: 'For guests staying a full month. Leave blank if weekly-only.',
  };

  const SHOWING_INSTRUCTIONS = {
    name: 'showing_instructions',
    label: 'How should buyers schedule showings?',
    type: 'multiselect',
    required: true,
    options: [
      'Click Showing Icon',
      'Call Listing Agent',
      'Call Listing Office',
      'Key Box – Supra iBox',
      'Vacant',
      'Tenant Occupied',
      'Owner Occupied',
      '24 Hour Notice',
      'Pet On Premises',
    ],
  };

  const DESCRIPTION_STEP = {
    name: 'property_description',
    label: 'Property description',
    type: 'description',
    required: true,
    max_chars: 1200,
    note: 'MLS will not accept names, phone numbers, gate codes, or URLs. Auto-scrubber strips violations before save.',
  };

  /* ----- Aari's standard Realtor / confidential remarks block.
     This is the boilerplate Marlenyi runs on every listing — agent response
     terms, contract format requirements, due-diligence disclaimer. Agents
     can take it as-is, override with their own (and save it to their
     profile for future listings), or load their previously-saved template. */
  const AARI_STANDARD_CONFIDENTIAL_REMARKS = (
    'Please allow seller a minimum of 2 DAYS to respond to all offers. ' +
    'Closing date is firm. NO "ON OR BEFORE" language accepted. ' +
    'Please submit all offers using the Florida Realtors/Florida Bar AS-IS ' +
    'Residential Contract or Vacant Land Contract for Sale and Purchase, along ' +
    'with proof of funds or pre-approval letter. Buyer and buyer’s agent to ' +
    'perform all due diligence and verify all information including lot ' +
    'dimensions, zoning, utilities, and buildability. Information is deemed ' +
    'reliable but not guaranteed and subject to errors, omissions, and changes.'
  );

  const CONFIDENTIAL_REMARKS_STEP = {
    name: 'confidential_remarks',
    label: 'Realtor remarks (agent-to-agent)',
    type: 'confidential_remarks',
    required: true,
    max_chars: 1500,
    note: 'Goes in the MLS Confidential Remarks field. Other agents see this — sellers do not.',
  };

  /* ----- Property type definitions ----- */
  const PROPERTY_TYPES = [

    /* ====================================================================
       1 · SINGLE FAMILY (Residential Profile Sheet Mar 2025)
       ==================================================================== */
    {
      id: 'single_family',
      label: 'Single Family',
      group: 'residential',
      available: true,
      profile_sheet: 'Residential Profile Sheet Mar 2025',
      building_design_default: 'Single Family',
      critical_fields: [
        ADDRESS_FIELD,
        OWNER_NAME,
        LIST_PRICE,
        STATUS_TYPE,
        BUILDING_DESIGN,
        { name: 'bedrooms', label: 'Bedrooms', type: 'select', required: true,
          options: ['0BR','1BR','1+Den','2BR','2+Den','3BR','3+Den','4BR','4+Den','5BR','5+Den','6 or more'] },
        { name: 'full_baths', label: 'Full baths', type: 'number', required: true, min: 0, max: 20 },
        { name: 'half_baths', label: 'Half baths', type: 'number', required: false, min: 0, max: 20 },
        { name: 'living_area_sqft', label: 'Approx. living area (sqft)', type: 'number', required: true, min: 100 },
        { name: 'total_area_sqft', label: 'Approx. total area (sqft)', type: 'number', required: false, min: 100 },
        SQFT_SOURCE,
        { name: 'year_built', label: 'Year built', type: 'number', required: true, min: 1800, max: 2100 },
        { name: 'lot_size_acres', label: 'Lot size (acres)', type: 'number', required: true, min: 0 },
        GARAGE_SPACES,
        PRIVATE_POOL,
        WATERFRONT,
        HOA_YESNO,
        HOA_FEE,
        HOA_FREQUENCY,
        LISTING_TYPE,
        LISTING_DATE,
        EXPIRATION_DATE,
        SETTLEMENT_AGENT_NAME,
        SETTLEMENT_AGENT_PHONE,
        SETTLEMENT_AGENT_EMAIL,
        SETTLEMENT_AGENT_ADDRESS,
        SHOWING_INSTRUCTIONS,
        DESCRIPTION_STEP,
        CONFIDENTIAL_REMARKS_STEP,
      ],
      sections: [
        { id: 'features', label: 'Features & amenities', field_count_estimate: 18 },
        { id: 'construction', label: 'Construction & systems', field_count_estimate: 14 },
        { id: 'rooms', label: 'Rooms & dimensions', field_count_estimate: 12 },
        { id: 'pool_view', label: 'Pool, view, waterfront — full details', field_count_estimate: 10 },
        { id: 'financial', label: 'HOA detail, taxes & fees', field_count_estimate: 10 },
        { id: 'records', label: 'PID, county, schools, legal description', field_count_estimate: 8 },
        { id: 'remarks', label: 'Driving directions', field_count_estimate: 1 },
      ],
    },

    /* ====================================================================
       2 · CONDO / VILLA (Residential Profile Sheet — same schema, different default)
       ==================================================================== */
    {
      id: 'condo_villa',
      label: 'Condo / Villa',
      group: 'residential',
      available: true,
      profile_sheet: 'Residential Profile Sheet Mar 2025',
      building_design_default: 'Villa Attached',
      critical_fields: [
        ADDRESS_FIELD,
        { name: 'unit_apartment', label: 'Unit / apartment #', type: 'text', required: true },
        OWNER_NAME,
        LIST_PRICE,
        STATUS_TYPE,
        BUILDING_DESIGN_CONDO,
        BUILDING_NUM,
        UNIT_FLOOR,
        { name: 'bedrooms', label: 'Bedrooms', type: 'select', required: true,
          options: ['0BR','1BR','1+Den','2BR','2+Den','3BR','3+Den','4BR','4+Den','5BR','5+Den','6 or more'] },
        { name: 'full_baths', label: 'Full baths', type: 'number', required: true, min: 0, max: 20 },
        { name: 'half_baths', label: 'Half baths', type: 'number', required: false, min: 0, max: 20 },
        { name: 'living_area_sqft', label: 'Approx. living area (sqft)', type: 'number', required: true, min: 100 },
        SQFT_SOURCE,
        { name: 'year_built', label: 'Year built', type: 'number', required: true, min: 1800, max: 2100 },
        PRIVATE_POOL,
        WATERFRONT,
        { name: 'condo_fee', label: 'Condo fee ($)', type: 'currency', required: true, min: 0 },
        { name: 'condo_fee_frequency', label: 'Condo fee frequency', type: 'radio', required: true,
          options: ['Monthly','Quarterly','Semi-annually','Annually'] },
        MASTER_HOA_YESNO,
        MASTER_HOA_FEE,
        MASTER_HOA_FREQUENCY,
        LISTING_TYPE,
        LISTING_DATE,
        EXPIRATION_DATE,
        SETTLEMENT_AGENT_NAME,
        SETTLEMENT_AGENT_PHONE,
        SETTLEMENT_AGENT_EMAIL,
        SETTLEMENT_AGENT_ADDRESS,
        SHOWING_INSTRUCTIONS,
        DESCRIPTION_STEP,
        CONFIDENTIAL_REMARKS_STEP,
      ],
      sections: [
        { id: 'building_complex', label: 'Building & complex full detail', field_count_estimate: 8 },
        { id: 'features', label: 'Features & amenities', field_count_estimate: 18 },
        { id: 'financial', label: 'Fees, assessments, taxes', field_count_estimate: 10 },
        { id: 'leasing_rules', label: 'Leasing & pet rules', field_count_estimate: 8 },
        { id: 'records', label: 'PID, county, schools, legal description', field_count_estimate: 8 },
        { id: 'remarks', label: 'Driving directions', field_count_estimate: 1 },
      ],
    },

    /* ====================================================================
       3 · MULTI-FAMILY / RES INCOME (Res Inc No Com 10/16/24)
       ==================================================================== */
    {
      id: 'multi_family',
      label: 'Multi-family',
      group: 'residential_income',
      available: true,
      profile_sheet: 'Res Inc No Com 101624',
      critical_fields: [
        ADDRESS_FIELD,
        OWNER_NAME,
        LIST_PRICE,
        STATUS_TYPE,
        { name: 'building_design', label: 'Property type', type: 'radio', required: true,
          options: ['Duplex','Triplex','Quad (4-plex)','5+ Units'] },
        { name: 'total_units', label: 'Total units', type: 'number', required: true, min: 2 },
        { name: 'total_bedrooms', label: 'Total bedrooms across all units', type: 'number', required: true, min: 0 },
        { name: 'total_baths', label: 'Total bathrooms across all units', type: 'number', required: true, min: 0 },
        { name: 'living_area_sqft', label: 'Total living area (sqft)', type: 'number', required: true, min: 100 },
        SQFT_SOURCE,
        { name: 'year_built', label: 'Year built', type: 'number', required: true, min: 1800, max: 2100 },
        { name: 'lot_size_acres', label: 'Lot size (acres)', type: 'number', required: true, min: 0 },
        WATERFRONT,
        { name: 'gross_annual_income', label: 'Gross annual income ($)', type: 'currency', required: true, min: 0 },
        ANNUAL_EXPENSES,
        LISTING_TYPE,
        LISTING_DATE,
        EXPIRATION_DATE,
        SETTLEMENT_AGENT_NAME,
        SETTLEMENT_AGENT_PHONE,
        SETTLEMENT_AGENT_EMAIL,
        SETTLEMENT_AGENT_ADDRESS,
        SHOWING_INSTRUCTIONS,
        DESCRIPTION_STEP,
        CONFIDENTIAL_REMARKS_STEP,
      ],
      sections: [
        { id: 'units_detail', label: 'Per-unit details (beds, baths, rent)', field_count_estimate: 20 },
        { id: 'income_expense', label: 'Income & expense breakdown', field_count_estimate: 10 },
        { id: 'features', label: 'Features & amenities', field_count_estimate: 14 },
        { id: 'financial', label: 'Taxes, HOA, fees', field_count_estimate: 8 },
        { id: 'records', label: 'PID, county, legal description', field_count_estimate: 6 },
        { id: 'remarks', label: 'Driving directions', field_count_estimate: 1 },
      ],
    },

    /* ====================================================================
       4 · LOT / LAND (Lot and Land No Com 10/16/24)
       ==================================================================== */
    {
      id: 'lot_land',
      label: 'Lot / Land',
      group: 'vacant',
      available: true,
      profile_sheet: 'Lot and Land No Com 101624',
      critical_fields: [
        ADDRESS_FIELD,
        OWNER_NAME,
        LIST_PRICE,
        { name: 'lot_type', label: 'Lot type', type: 'radio', required: true,
          options: ['Residential Lot','Commercial Lot','Acreage'] },
        NUM_PARCELS,
        { name: 'lot_size_acres', label: 'Lot size (acres)', type: 'number', required: true, min: 0 },
        { name: 'lot_frontage_ft', label: 'Lot frontage (ft)', type: 'number', required: false, min: 0 },
        ELEVATION,
        { name: 'zoning_code', label: 'Zoning code', type: 'text', required: true },
        { name: 'land_use_code', label: 'Land use code', type: 'select', required: true,
          options: ['00 — Vacant Residential','01 — Single Family','02 — Mobile Homes','03 — Multi Family 10+ units','04 — Condominium','05 — Cooperatives','99 — Acreage Not Zoned Agricultural','Other'] },
        { name: 'utilities_available', label: 'Utilities available', type: 'multiselect', required: true,
          options: ['Cable','Electric','Gas','Water','Sewer','Phone Line','Trash Removal','None'] },
        { name: 'waterfront', label: 'Waterfront?', type: 'yesno', required: true },
        LISTING_TYPE,
        LISTING_DATE,
        EXPIRATION_DATE,
        SETTLEMENT_AGENT_NAME,
        SETTLEMENT_AGENT_PHONE,
        SETTLEMENT_AGENT_EMAIL,
        SETTLEMENT_AGENT_ADDRESS,
        SHOWING_INSTRUCTIONS,
        DESCRIPTION_STEP,
        CONFIDENTIAL_REMARKS_STEP,
      ],
      sections: [
        { id: 'land_features', label: 'Ground cover, trees, terrain', field_count_estimate: 10 },
        { id: 'usage_planned', label: 'Usage & planned use', field_count_estimate: 10 },
        { id: 'documents', label: 'Available documents (survey, perc, etc.)', field_count_estimate: 14 },
        { id: 'financial', label: 'Taxes, HOA, fees', field_count_estimate: 8 },
        { id: 'records', label: 'PID, county, legal description', field_count_estimate: 6 },
        { id: 'remarks', label: 'Driving directions', field_count_estimate: 1 },
      ],
    },

    /* ====================================================================
       5 · RENTAL — ANNUAL (Rental Long No Com 10/16/24)
       ==================================================================== */
    {
      id: 'rental_long',
      label: 'Rental — Annual',
      group: 'rental',
      available: true,
      profile_sheet: 'Rental Long No Com 101624',
      critical_fields: [
        ADDRESS_FIELD,
        { ...OWNER_NAME, label: 'Owner / landlord name' },
        { name: 'rent_amount', label: 'Monthly rent ($)', type: 'currency', required: true, min: 0 },
        { name: 'security_deposit', label: 'Security deposit ($)', type: 'currency', required: true, min: 0 },
        APPLICATION_FEE,
        { name: 'available_date', label: 'Available date', type: 'date', required: true },
        { name: 'lease_term_months', label: 'Lease term (months)', type: 'number', required: true, min: 1 },
        { name: 'bedrooms', label: 'Bedrooms', type: 'select', required: true,
          options: ['0BR','1BR','2BR','3BR','4BR','5BR','6 or more'] },
        { name: 'full_baths', label: 'Full baths', type: 'number', required: true, min: 0 },
        { name: 'living_area_sqft', label: 'Living area (sqft)', type: 'number', required: true, min: 100 },
        { name: 'furnished', label: 'Furnished?', type: 'radio', required: true,
          options: ['Furnished','Partly Furnished','Unfurnished','Turnkey','Negotiable'] },
        { name: 'pets_allowed', label: 'Pets allowed?', type: 'radio', required: true,
          options: ['Yes','No','With Approval','Limits'] },
        RENTAL_MANAGEMENT_CO,
        LISTING_DATE,
        SHOWING_INSTRUCTIONS,
        DESCRIPTION_STEP,
        CONFIDENTIAL_REMARKS_STEP,
      ],
      sections: [
        { id: 'owner_tenant_pays', label: 'Owner pays / Tenant pays splits', field_count_estimate: 24 },
        { id: 'features', label: 'Features & amenities', field_count_estimate: 14 },
        { id: 'rental_management', label: 'Rental management company info', field_count_estimate: 4 },
        { id: 'restrictions', label: 'Pet limits, parking, restrictions', field_count_estimate: 8 },
        { id: 'remarks', label: 'Remarks & driving', field_count_estimate: 2 },
      ],
    },

    /* ====================================================================
       6 · RENTAL — SHORT TERM (Rental Short No Com 10/16/24)
       ==================================================================== */
    {
      id: 'rental_short',
      label: 'Rental — Short',
      group: 'rental',
      available: true,
      profile_sheet: 'Rental Short No Com 101624',
      critical_fields: [
        ADDRESS_FIELD,
        { ...OWNER_NAME, label: 'Owner / landlord name' },
        { name: 'rent_weekly', label: 'Weekly rate — peak season ($)', type: 'currency', required: true, min: 0 },
        { name: 'rent_off_season', label: 'Weekly rate — off season ($)', type: 'currency', required: false, min: 0 },
        MONTHLY_RATE,
        { name: 'cleaning_fee', label: 'Cleaning fee ($)', type: 'currency', required: true, min: 0 },
        { name: 'min_nights', label: 'Minimum nights', type: 'number', required: true, min: 1 },
        { name: 'available_date', label: 'Next available date', type: 'date', required: true },
        { name: 'bedrooms', label: 'Bedrooms', type: 'select', required: true,
          options: ['0BR','1BR','2BR','3BR','4BR','5BR','6 or more'] },
        { name: 'full_baths', label: 'Full baths', type: 'number', required: true, min: 0 },
        { name: 'sleeps', label: 'Max occupancy (sleeps)', type: 'number', required: true, min: 1 },
        { name: 'furnished', label: 'Furnished?', type: 'radio', required: true,
          options: ['Furnished','Turnkey'] },
        { ...PRIVATE_POOL, note: 'Top filter on vacation rental sites — drives bookings.' },
        { ...WATERFRONT, note: 'Gulf access, canal, lake details captured in portal follow-up.' },
        { name: 'pets_allowed', label: 'Pets allowed?', type: 'radio', required: true,
          options: ['Yes','No','With Approval'] },
        RENTAL_MANAGEMENT_CO,
        LISTING_DATE,
        SHOWING_INSTRUCTIONS,
        DESCRIPTION_STEP,
        CONFIDENTIAL_REMARKS_STEP,
      ],
      sections: [
        { id: 'seasonal_rates', label: 'Seasonal rate matrix', field_count_estimate: 16 },
        { id: 'amenities', label: 'Amenities & equipment', field_count_estimate: 18 },
        { id: 'restrictions', label: 'House rules, pet limits, parking', field_count_estimate: 8 },
        { id: 'rental_management', label: 'Rental management info', field_count_estimate: 4 },
        { id: 'remarks', label: 'Remarks & driving', field_count_estimate: 2 },
      ],
    },

    /* ====================================================================
       NOTE · Commercial + Boat Dock removed May 17 2026
       --------------------------------------------------------------------
       The 2018 NABOR profile sheets we had on file don't match the Lee
       County / SWFLMLS forms Marlenyi's market uses. Rather than ship
       outdated cross-MLS schemas, both property types are fully removed
       from the picker. Agents listing a commercial property or standalone
       boat dock should submit via TC One Side with a note · TC handles
       MLS entry manually until current Lee County sheets are provided.
       When those sheets land, re-introduce here as fresh entries with
       new critical_fields + sections arrays.
       ==================================================================== */
  ];

  /* ----- Helpers ----- */
  function getById(id) {
    return PROPERTY_TYPES.find(t => t.id === id) || null;
  }

  function getAvailable() {
    return PROPERTY_TYPES.filter(t => t.available);
  }

  function getCriticalFields(propertyTypeId) {
    const t = getById(propertyTypeId);
    return t && t.available ? t.critical_fields : [];
  }

  function getSections(propertyTypeId) {
    const t = getById(propertyTypeId);
    return t && t.available ? t.sections : [];
  }

  global.AariListingSchema = {
    version: '1.1',
    last_updated: '2026-05-17',
    property_types: PROPERTY_TYPES,
    AARI_STANDARD_CONFIDENTIAL_REMARKS: AARI_STANDARD_CONFIDENTIAL_REMARKS,
    getById,
    getAvailable,
    getCriticalFields,
    getSections,
  };

})(window);
