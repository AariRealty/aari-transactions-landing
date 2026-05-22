-- ============================================================
-- Import Eileen's BD contacts · 195 deduped
-- V2 · self-diagnostic · robust Eileen lookup
-- ============================================================

DO $$
DECLARE
  v_eileen_id uuid;
  v_match_count int;
  v_inserted int;
  v_match_record record;
BEGIN
  -- DIAGNOSTIC: show all agents whose first_name or last_name contains 'eil'
  RAISE NOTICE '--- Diagnostic: candidate agents matching ''eil'' ---';
  FOR v_match_record IN
    SELECT id, first_name, last_name, role
    FROM agents
    WHERE LOWER(COALESCE(first_name, '')) LIKE '%eil%'
       OR LOWER(COALESCE(last_name, '')) LIKE '%eil%'
  LOOP
    RAISE NOTICE 'Candidate · id=% · first_name=% · last_name=% · role=%',
      v_match_record.id, v_match_record.first_name, v_match_record.last_name, v_match_record.role;
  END LOOP;

  -- Resolve Eileen · prefer role=tc + first_name starting with 'eileen', fallback to any match
  SELECT id INTO v_eileen_id
  FROM agents
  WHERE LOWER(first_name) = 'eileen' AND role = 'tc'
  LIMIT 1;

  IF v_eileen_id IS NULL THEN
    SELECT id INTO v_eileen_id
    FROM agents
    WHERE LOWER(first_name) LIKE 'eileen%'
    LIMIT 1;
  END IF;

  IF v_eileen_id IS NULL THEN
    SELECT id INTO v_eileen_id
    FROM agents
    WHERE LOWER(COALESCE(first_name, '')) LIKE '%eil%'
       OR LOWER(COALESCE(last_name, '')) LIKE '%eil%'
    LIMIT 1;
  END IF;

  IF v_eileen_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Eileen in agents table. Check the candidates printed above.';
  END IF;

  RAISE NOTICE '✓ Resolved Eileen · owner_id=%', v_eileen_id;

  -- Ensure unique constraint on (owner_id, handle)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bd_contacts_owner_handle_key') THEN
    ALTER TABLE bd_contacts ADD CONSTRAINT bd_contacts_owner_handle_key UNIQUE (owner_id, handle);
    RAISE NOTICE '✓ Added unique constraint bd_contacts_owner_handle_key';
  END IF;

  -- Insert all contacts
  WITH src AS (
    SELECT * FROM (VALUES
      ('Jessie Mendoza', '@jessie.doza', 'IG search', 'Hand Raise', NULL, NULL::timestamptz),
      ('Alex Kirilloff', '@akirilloff19', 'IG search', 'Contacted', 'Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Arlet Mesa', '@realtorarlet', 'IG search', 'Contacted', 'Brokerage: Realty World · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Carlos Ordinola Pestana', '@soldbycarlosfl', 'IG search', 'Contacted', 'Brokerage: Marzucco · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Dayana Batista', '@dayanabatista.realtor', 'IG search', 'Contacted', 'Brokerage: The Olea Group · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Emelin Hernandez', '@emelinrealtor', 'IG search', 'Contacted', 'Brokerage: Sellstate 5 Star Realty · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Gladisleidys Gonzalez', '@lifestyle_gladita', 'IG search', 'Contacted', 'Brokerage: OneFamilyRealty · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Lukas Castano Escobar', '@escobarlukas_', 'IG search', 'Contacted', 'Brokerage: Escobar Brothers · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Lupita Prada', '@reallupitaprada', 'IG search', 'Contacted', 'Brokerage: Ipt Realty · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Marlene Llamas Leon', '@youragentmarlenellamasleon', 'IG search', 'Contacted', 'Brokerage: LPT Realty · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Natasha Shaw', '@natasha.realestate', 'IG search', 'Contacted', 'Brokerage: Marzucco Luxury Real Estate · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Sandra Aguilar', '@homessoldbysandra', 'IG search', 'Contacted', 'Brokerage: Rent 1 Sale 1 Realty · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Wilmar Sosa', '@wilmarsosarealtor', 'IG search', 'Contacted', 'Brokerage: My Realty Real Estate Group · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Yazmin Hurtado', '@yazrealtorh', 'IG search', 'Contacted', 'Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Yessenia Garcia', '@yessygarciafloridaliving', 'IG search', 'Contacted', 'Brokerage: Astra Elite Group · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Yuliber Barett Delgado', '@yuliberbarettrealtor', 'IG search', 'Contacted', 'Brokerage: La Rosa Realty · Follow up in 2 days', '2026-05-05 12:00:00+00'::timestamptz),
      ('Brian Walker', '@mrbrianwalker', 'IG search', 'Contacted', 'Brokerage: Plunkett Realty LLC · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Bryant Camara', '@itmustbetanke', 'IG search', 'Contacted', 'Brokerage: Easy Mortgage LLC · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Florida Rise Team', '@florida_rise_team', 'IG search', 'Contacted', 'Brokerage: KW Elevate Luxury | The Rise Team · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('James K Boyer', '@jamesboyer', 'IG search', 'Contacted', 'Brokerage: Serhant · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Joel Martinez', '@joelmartinez.realtor', 'IG search', 'Contacted', 'Brokerage: Mamba Realty · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Jude Termidor', '@ajricet', 'IG search', 'Contacted', 'Brokerage: Palm Paradise Realty Group · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Kate Sauders', '@katejsauders', 'IG search', 'Contacted', 'Brokerage: Palm Paradise Realty Group · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Kimberley Menkhorst', '@lavishlivingnaplesfl', 'IG search', 'Contacted', 'Brokerage: Premiere Plus Realty Co. · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Lindsay Blaylock', '@movemetofl_', 'IG search', 'Contacted', 'Brokerage: Charles Rutenberg Realty · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Miraya Lane', '@mirayalane', 'IG search', 'Contacted', 'Brokerage: Keller Williams Advantage III Realty · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Paul Medina', '@paulmedinarealtor', 'IG search', 'Contacted', 'Brokerage: Access Realty · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Renee Storms', '@listwithrenee', 'IG search', 'Contacted', 'Brokerage: John R Wood Properties · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Sheera Cook', '@sheerasellsswfl', 'IG search', 'Contacted', 'Brokerage: LPT · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Veronica Mora Costa', '@veronicamora.realtor', 'IG search', 'Contacted', 'Brokerage: Lifestyle International Realty · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Ythamarie Rosario', '@soldbyytha', 'IG search', 'Contacted', 'Brokerage: Keller Williams Advantage III · Follow up in 2 days', '2026-05-06 12:00:00+00'::timestamptz),
      ('Adriana Alonso', '@adrii.realtor', 'IG search', 'Contacted', 'Brokerage: Mamba Realty · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Alejandra Jimenez', '@alejandrajimenez.re', 'IG search', 'Contacted', 'Brokerage: Marzucco · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Amanda Palmer', '@amannnduhh', 'IG search', 'Contacted', 'Brokerage: Avenue Florida · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Ariadna de los Arcos', '@ariadna.realestate', 'IG search', 'Contacted', 'Brokerage: Hustle Bees Realty · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Ariana Jach', '@arianajachh', 'IG search', 'Replied', 'Stage = Replied → goes in Talking bucket', '2026-05-07 12:00:00+00'::timestamptz),
      ('Crystal Negron', '@crystal_negronsellsswfl', 'IG search', 'Hand Raise', NULL, '2026-05-07 12:00:00+00'::timestamptz),
      ('Gabriel Bottan', '@gabriel.bottan', 'IG search', 'Contacted', 'Brokerage: Anchor Real Estate · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Lillyam Hernandez', '@lillyam_yourfloridarealtor', 'IG search', 'Contacted', 'Brokerage: Hustle Bees Realty · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Roxana Gonzalez', '@_roxyrealtor', 'IG search', 'Contacted', 'Brokerage: Mamba Realty · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Samantha Haringa', '@samantha.haringa', 'IG search', 'Replied', 'Stage = Replied → goes in Talking bucket', '2026-05-07 12:00:00+00'::timestamptz),
      ('Sasha G. Ruisz-Lopez', '@sashasoldit', 'IG search', 'Contacted', 'Brokerage: Miromar Real Estate · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Selena Acanda', '@selenarealtor_swfl', 'IG search', 'Contacted', 'Brokerage: Innova Realtors · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Teven Gustave', '@teventherealtor', 'IG search', 'Contacted', 'Brokerage: Passkey Realty LLC · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Yaima Perez', '@yaima_perez_realtor', 'IG search', 'Contacted', 'Brokerage: Mato Realty · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Yusnaidy Molina', '@molina_realtor7', 'IG search', 'Contacted', 'Brokerage: Hustle Bees Realty LLC · Follow up in 2 days', '2026-05-07 12:00:00+00'::timestamptz),
      ('Aileen Andino', '@realestatebyaileen', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Ali Kochno', '@alikochno.realtor', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Amanda Boyer', '@swfl_amanda', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Ashley Pon', '@ash_swfl', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Barbra Brogdon', '@barbsellsunshine', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Brayan Perez', '@its_brayanperez', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Darlen Martinez', '@darmartinez_realtor', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Javier Casillas', '@javiercasillasrealtor', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Kat Sanchez', '@kat_sanchez_realtor', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Kristia Ghafari', '@kristia.sells.florida', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Maria Nieto', '@maria.nieto.realestate_', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Michelle Trevino', '@michelletrevinorealtor', 'IG search', 'Hand Raise', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Omar Perez', '@omar_perez97', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Tatum Praise', '@tatumpraise', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Yuley Stiven', '@yuleyrealtorcapecoral', 'IG search', 'Contacted', NULL, '2026-05-08 12:00:00+00'::timestamptz),
      ('Adrian Aguiar', '@builderbyadrian', 'IG search', 'Contacted', 'Brokerage: Starlink Realty · Email: builderbyadrian@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Alejandro Munoz', '@alejandromunozreator', 'IG search', 'Contacted', 'Brokerage: EXP Realty · Email: alejandromunozre@outlook.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Anthony Churlin', '@anthonychurlinrealtor', 'IG search', 'Contacted', 'Brokerage: Remax · Email: churlinrealestate@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Charlene Rodriguez', '@charlenerodriguezrealtor', 'IG search', 'Contacted', 'Brokerage: Rent 1 Sale 1 Realty · Email: rent1sale1cr@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Claudia Garcia', '@garcia_sellshomes', 'IG search', 'Contacted', 'Brokerage: Gold Pen Group · Email: claudiagarcia.realtor25@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Eduardo Linares', '@elinares.realtor', 'IG search', 'Contacted', 'Brokerage: Ace Realty · Email: eduardo@acerealtyassociates.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Edwilis Martinez', '@edswflrealtor', 'IG search', 'Contacted', 'Brokerage: Realty ONE Group MVP · Email: floridaluxproperties@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Gibby Eagle', '@gibby-eagle-swflrealtor', 'IG search', 'Contacted', 'Brokerage: Maxim Pres+Com Realty · Email: gibbyeagle@outlook.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Ingrid Johana Mosquera', '@ingridjmrealtor', 'IG search', 'Contacted', 'Brokerage: Realtor HomeSmart · Email: ingridplhomes@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Juliet Bain', '@julietsellsfl', 'IG search', 'Contacted', 'Brokerage: Lokation Real Estate · Email: juliet@julietbain.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Kate Hatton', '@tampabaykate', 'IG search', 'Contacted', 'Brokerage: Keller Williams Realty · Email: katehatton@kw.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Liane Consuegra', '@lianesells_swfl', 'IG search', 'Contacted', 'Brokerage: Mamba Realty · Email: lianesellsswfl@gmail.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Melissa Rodriguez', '@thatrealtormelissa', 'IG search', 'Contacted', 'Brokerage: EXP Realty · Email: melissar@goganteam.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Shelby N. Solley', '@swflrealtor', 'IG search', 'Contacted', 'Brokerage: Medway Realty · Email: shelbysolley@yahoo.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Skip Riddle', '@swflrealtorskip', 'IG search', 'Contacted', 'Brokerage: Compass, The Bowers Group · Email: skip.riddle@compass.com', '2026-05-12 12:00:00+00'::timestamptz),
      ('Alana LaCava-Hearn', '@alana_sellssunshine', 'IG search', 'Hand Raise', 'Brokerage: Miloff Aubuchon Group · Email: alana@miloffaubuchon.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Alek Petrov', '@alexpetrov_realtor', 'IG search', 'Contacted', 'Brokerage: LPT Realty · Email: alex@alexpetrovswfl.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Alexis Hansen May', '@alexismaysellsswfl', 'IG search', 'Contacted', 'Brokerage: Keller Williams · Email: alexishansen@kw.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Amy Bohn', '@amy_bohn_realtor', 'IG search', 'Hand Raise', 'Brokerage: Sellstate Advantage Realty', '2026-05-13 12:00:00+00'::timestamptz),
      ('Andre Acosta', '@andreacosta_realtor', 'IG search', 'Contacted', 'Brokerage: Marzucco Real Estate · Email: andreacostarealtor@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Berry Cessna', '@berrycessna', 'IG search', 'Contacted', 'Brokerage: EXP Realty · Email: soldbyberry@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Brittany Mixon', '@brittanymixon.realtor', 'IG search', 'Contacted', 'Brokerage: Mixon Team · Email: brittany@teammixon.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Chelsea Defina', '@thecapecoralrealtor', 'IG search', 'Hand Raise', 'Brokerage: Domain Realty · Email: chelseadefinarealty@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Cheyla Garcia', '@cheylagarcia_realtor', 'IG search', 'Contacted', 'Email: cheylagarcia20@yahoo.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Danielle Stefanacci', '@daniellestafanacci', 'IG search', 'Contacted', 'Brokerage: Corkscrew Real Estate · Email: danielleallenswfl@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Dylan Smith', '@dylansmith10', 'IG search', 'Contacted', 'Brokerage: Compass · Email: dylan.smith@compass.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Elizabeth Wilson', '@cape.coralrealtor', 'IG search', 'Contacted', 'Brokerage: EXP Realty · Email: elizabeth.wilson.275413@exprealty.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Emily Colamarino', '@emilysellstampabay', 'IG search', 'Contacted', 'Brokerage: Circuitous Realty · Email: emily@circuitousrealty.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Jackson Simison', '@jacksonsimison', 'IG search', 'Contacted', 'Brokerage: Royal Shell Real Estate · Email: jackson@mcmurrayandmembers...', '2026-05-13 12:00:00+00'::timestamptz),
      ('Jailyn Olmeda', '@jailynolmedarealtor', 'IG search', 'Contacted', 'Brokerage: The Olea Group · Email: jailynolmedarealtor@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Jason Edouard', '@jasonedouard.realtor', 'IG search', 'Contacted', 'Brokerage: Domain Realty · Email: jason@edouardrealestate.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Jennyfer Torres', '@jensellsswfl', 'IG search', 'Contacted', 'Brokerage: Realty One Group · Email: jennyfer@jennyfertorres.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Jessica McKelvie', '@jessicamckelvierealtor', 'IG search', 'Contacted', 'Brokerage: Starlink Realty · Email: jessicamckelvierealtor@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Kaia Wilkerson', '@kaiasellsfl', 'IG search', 'Contacted', 'Brokerage: John M Wood Properties · Email: kwilkerson@johnrwood...', '2026-05-13 12:00:00+00'::timestamptz),
      ('Kaitlin Chernyshov', '@kaitlinjacksonvillerealtor', 'IG search', 'Contacted', 'Brokerage: Unite Real Estate Gallery · Email: katiechernyshov@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Kateryna Vivdenko', '@kateryna_vivdenko', 'IG search', 'Contacted', 'Brokerage: Broker One · Email: agentkateryna@miamisky.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Kayla McLead', '@yourswflrealtorkayla', 'IG search', 'Contacted', 'Brokerage: Coldwell Banker Realty · Email: kayla.mclead@cbrealty.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Kleydi Nodal', '@kleydi_realestate', 'IG search', 'Contacted', 'Brokerage: Mamba Realty · Email: kleydi@nodalproperties.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Lia Angulo', '@lia.angulosfwlrealtor', 'IG search', 'Contacted', 'Brokerage: Marzucco Real Estate · Email: infoservicesliaangulo@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Pesche Robinson', '@pesche.robinson', 'IG search', 'Contacted', 'Brokerage: Serhant · Email: pesche.robinson@serhant.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Ryan Leben', '@ryanleben_naplesluxuryrealtor', 'IG search', 'Contacted', 'Brokerage: Realty One Group · Email: ryanleben@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Sten Simonsen', '@realdealssten', 'IG search', 'Contacted', 'Brokerage: Keller Williams Elevate Luxury · Email: sten@millemonge.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Tom Liddy', '@tom_liddy-swfl_realtor', 'IG search', 'Contacted', 'Brokerage: The Keyes Company · Email: tomliddyswflrealtor@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Victoria Nicholas', '@realtor.victorianicholas', 'IG search', 'Contacted', 'Brokerage: Real Broker LLC · Email: vnicholas.properties@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Whitney Burrows', '@whitneyswflrealtor', 'IG search', 'Contacted', 'Brokerage: Remax Nautical Realty · Email: whitneysellsswfl@gmail.com', '2026-05-13 12:00:00+00'::timestamptz),
      ('Andrea Mollica', '@andreamollica_realtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Angely Reinosa', '@angellyrealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('DJ Brooks', '@djbrooks_real_estate', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Daniel Martinez', '@dannyswhomes', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Gigi Ricciardi Hull', '@gigi_naples_realtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Henry Albarracin', '@henryyourswflrealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Jadiel Perez', '@jadiel.therealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Jess Powell', '@jessyournaplesrealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Jessica Gonzalez', '@jessysellshomes', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Marcella Sousa', '@marcella_realestate', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Masiel Mejia', '@masielmejiarealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Matthew Harrington', '@mharrington.r', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Melissa Luzardo', '@melyturealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Montana Wynant', '@realtor_montana', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Yasmina Santana', '@yasminanaplesrealtor', 'IG search', 'Contacted', NULL, '2026-05-14 12:00:00+00'::timestamptz),
      ('Alison Gesuele', '@alisongesuele.realtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Dan MacKinnon', '@dan_the_realtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Daniela Rivera', '@daniela.realtorflorida', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Katherine Jattin', '@kj_floridarealtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Klarissa Grumbo', '@klarissasellsitall_', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Laura Rojas', '@realtordeflorida', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Lissette Sanchez', '@lissette_sanchez_realestate', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Mariely Kenty', '@marielykenty.realtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Melissa Cheetham', '@movewithmelissac', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Mike McMurray', '@mikehmcmurray', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Rick Haas', '@ricksellsnaples', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Savannah Zarris', '@savannahzarrisrealtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Steven Torres', '@storres.realtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Taylor Rompell', '@taylorsellsswfl', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Yaquelin Albuerne Garcia', '@yaquelin.floridarealtor', 'IG search', 'Contacted', NULL, '2026-05-15 12:00:00+00'::timestamptz),
      ('Anabel Consuegra', '@anabelconsuegraa', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Arlyn Hernandez', '@arlynh_realestate', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Bella North', '@bella.northrealtor', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Brittany Strand', '@brittanystrandrealtor', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Christopher Brent Sergakis', '@family_friends_realestate', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Danelis Veliz', '@danelisveliz.realtor', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Danielle J Morieko', '@dj_morieko', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Diane Coto', '@dianecoto.fl', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Fabrizio Quintana', '@fabrizio__quintana', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Maria Jose Escobar', '@mariajescobar.realtor', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Mariah Jones', '@movewithmariah.realtor', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Matthew Huffman', '@huff_941realestate', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Maxine Groshell Bradshaw', '@maxinegroshellrealestate', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Michelle Vega', '@michelle_renee_vega', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Ryan Miller', '@srqrealesteryan', 'IG search', 'Contacted', NULL, '2026-05-16 12:00:00+00'::timestamptz),
      ('Brandon Fajardo', '@brandon_fajadaroo', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Brian Giacomello', '@briangiacomello', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('David Burnham', '@buyfromburnham', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Indra Lemus', '@indrasellsswfl', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Jennifer Paulke', '@jenniferpaulke.swfl.realtor', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Kara Pleasant', '@kara_present_swfl_realtor', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Kate Howard', '@katehasthekey', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Kayla Mcdonald', '@kaylasgotthekeys', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Leidy Penton', '@leidylaura_flrealtor', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Macy Monge', '@macymonge', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Narvy Parra', '@narvyparrarealestate', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Neymar Carrero', '@neymar.realtor', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Ryan Jabbour', '@jabboursellshomes', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Vikki Salese', '@naplesv2k', 'IG search', 'Contacted', NULL, '2026-05-19 12:00:00+00'::timestamptz),
      ('Alexa Cambria', '@naplesrealtoralexa', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Danielle M. Reidy', '@daniellereidyrealtor', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Jasmin Cabral', '@cabralestates', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Jeremy DeMers', '@jeremydemera_realestate', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Joan I. Bastidas', '@joaniebastidastherealtor', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Jorge Lopez', '@jorgelopezmiami', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Lorraine Assis', '@assislorraine_', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Mariam Gonzalez', '@mariamgonzalezrealtor', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Natalie Perez-Benitoa', '@nattypb', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Peyton Terris', '@peyton_terris', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Rashard "Ray" Walker', '@raysellsorlando', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Robert Cardenas', '@myrealtor_robert', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Sal Messina', '@salimessina', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Spencer Robinson', '@spencer_r12', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Tony Grech', '@tonygrechrealtor', 'IG search', 'Contacted', NULL, '2026-05-20 12:00:00+00'::timestamptz),
      ('Amanda Mckinstry', '@amanda_mckinstry_realtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Amy Huber', '@amyhuber.realtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Arys Pupo', '@aryspupo_real_estate_agent', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Barry Levinson', '@levinsonluxurygroup', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Brooke Harris', '@brooke.harris.realtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Chelsea Robinson', '@capecoralfortmyersre', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Darahi Duran', '@darahi_realtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Doug DiBlasio', '@swflorida_realtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Gina Hutchinson', '@gina_sells_dreamhomes', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Karina Angulo', '@karinaangulo.realtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Nicole Dahlberg', '@swflsoldbynicole', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Roshelle Santiago', '@roshelleflrealtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Shellie Donofrio', '@shelliesellsswfl', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Yai Galarraga', '@yairealtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz),
      ('Yerimar Aguero', '@yerirealtor', 'IG search', 'Contacted', NULL, '2026-05-21 12:00:00+00'::timestamptz)
    ) AS v(name, handle, source, stage, notes, dm_sent_at)
  ),
  ins AS (
    INSERT INTO bd_contacts (owner_id, name, handle, source, stage, notes, dm_sent_at, last_touch_at)
    SELECT v_eileen_id, src.name, src.handle, src.source, src.stage, src.notes, src.dm_sent_at::timestamptz, src.dm_sent_at::timestamptz
    FROM src
    ON CONFLICT (owner_id, handle) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, bd_contacts.name),
      stage = CASE
        WHEN bd_contacts.stage IN ('Signed','Discovery Booked','Hand Raise','Added to AC','In Conversation','Replied')
          AND EXCLUDED.stage = 'Contacted' THEN bd_contacts.stage
        ELSE EXCLUDED.stage
      END,
      notes = CASE
        WHEN bd_contacts.notes IS NULL THEN EXCLUDED.notes
        WHEN EXCLUDED.notes IS NULL THEN bd_contacts.notes
        WHEN bd_contacts.notes = EXCLUDED.notes THEN bd_contacts.notes
        ELSE bd_contacts.notes || ' · ' || EXCLUDED.notes
      END,
      last_touch_at = GREATEST(bd_contacts.last_touch_at, COALESCE(EXCLUDED.dm_sent_at, bd_contacts.last_touch_at))
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RAISE NOTICE '✓ Processed % contact rows (insert or update)', v_inserted;
  RAISE NOTICE '--- DONE ---';
END $$;

-- Total in source: 195 unique contacts
