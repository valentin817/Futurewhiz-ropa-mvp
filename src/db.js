import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { CONTROLLER_PROFILE_DEFAULTS, CONTROLLED_VOCABULARY_SEEDS, SECURITY_MEASURE_SEEDS, STATUS_OPTIONS } from './constants.js';
import { addMonths, nowIso, stringifyJsonArray, todayIsoDate } from './helpers.js';

const DB_PATH = path.resolve(process.cwd(), process.env.DB_PATH || 'data/ropa.db');

let db;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openDatabase(filePath) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filePath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(database);
    });
  });
}

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1) return args[0] ?? [];
  return args;
}

function compileStatement(database, sql) {
  return {
    get: (...args) =>
      new Promise((resolve, reject) => {
        database.get(sql, normalizeParams(args), (error, row) => {
          if (error) return reject(error);
          resolve(row);
        });
      }),
    all: (...args) =>
      new Promise((resolve, reject) => {
        database.all(sql, normalizeParams(args), (error, rows) => {
          if (error) return reject(error);
          resolve(rows);
        });
      }),
    run: (...args) =>
      new Promise((resolve, reject) => {
        database.run(sql, normalizeParams(args), function handleRun(error) {
          if (error) return reject(error);
          resolve({
            changes: this.changes,
            lastInsertRowid: this.lastID
          });
        });
      })
  };
}

async function exec(database, sql) {
  await new Promise((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

async function seedVocabulary(database) {
  const insert = compileStatement(
    database,
    `
      INSERT INTO vocabulary_values (group_key, value_key, label, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `
  );

  for (const seedGroup of CONTROLLED_VOCABULARY_SEEDS) {
    const existing = await compileStatement(
      database,
      'SELECT COUNT(*) AS count FROM vocabulary_values WHERE group_key = ?'
    ).get(seedGroup.groupKey);

    if (existing.count > 0) continue;

    for (const [index, label] of seedGroup.items.entries()) {
      const valueKey = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      await insert.run(seedGroup.groupKey, valueKey, label, index + 1, nowIso(), nowIso());
    }
  }
}

async function seedUsers(database) {
  const existing = await compileStatement(database, 'SELECT COUNT(*) AS count FROM users').get();
  if (existing.count > 0) return;

  const users = [
    ['Linda Vermeer', 'linda.vermeer@futurewhiz.com', 'admin', 'Legal & Privacy'],
    ['Maud Jansen', 'maud.jansen@futurewhiz.com', 'legal', 'Legal & Privacy'],
    ['Tom de Vries', 'tom.devries@futurewhiz.com', 'business', 'Product'],
    ['Sara Khan', 'sara.khan@futurewhiz.com', 'business', 'Engineering'],
    ['Eva Bakker', 'eva.bakker@futurewhiz.com', 'business', 'People & Culture'],
    ['Noor Visser', 'noor.visser@futurewhiz.com', 'business', 'Customer Success']
  ];

  const insert = compileStatement(
    database,
    `
      INSERT INTO users (name, email, role, department, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `
  );

  for (const [name, email, role, department] of users) {
    await insert.run(name, email, role, department, nowIso(), nowIso());
  }
}

async function ensureControllerProfile(database) {
  const existing = await compileStatement(database, 'SELECT COUNT(*) AS count FROM controller_profile').get();
  if (existing.count > 0) return;

  await compileStatement(
    database,
    `
      INSERT INTO controller_profile (
        company_name, contact_name, address, phone_number, email, chamber_of_commerce, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    CONTROLLER_PROFILE_DEFAULTS.company_name,
    CONTROLLER_PROFILE_DEFAULTS.contact_name,
    CONTROLLER_PROFILE_DEFAULTS.address,
    CONTROLLER_PROFILE_DEFAULTS.phone_number,
    CONTROLLER_PROFILE_DEFAULTS.email,
    CONTROLLER_PROFILE_DEFAULTS.chamber_of_commerce,
    nowIso(),
    nowIso()
  );
}

async function ensureSecurityMeasureLibrary(database) {
  const existing = await compileStatement(database, 'SELECT COUNT(*) AS count FROM security_measure_library').get();
  if (existing.count > 0) return;

  const insert = compileStatement(
    database,
    `
      INSERT INTO security_measure_library (
        category, title, description, created_by_email, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, 'seed@futurewhiz.com', ?, ?, ?)
    `
  );

  for (const [index, item] of SECURITY_MEASURE_SEEDS.entries()) {
    await insert.run(item.category, item.title, item.description, index + 1, nowIso(), nowIso());
  }
}

async function seedActivities(database) {
  const existing = await compileStatement(database, 'SELECT COUNT(*) AS count FROM activities').get();
  if (existing.count > 0) return;

  const users = await compileStatement(database, 'SELECT * FROM users').all();
  const userByEmail = new Map(users.map((user) => [user.email, user]));
  const createdAt = nowIso();

  const demoActivities = [
    {
      reference: 'ROPA-0001',
      activity_name: 'Student learning account management',
      short_description:
        'Provision and operate student accounts for Squla, including learning progress, assignments, and teacher reporting.',
      business_owner_email: 'tom.devries@futurewhiz.com',
      legal_reviewer_email: 'maud.jansen@futurewhiz.com',
      department: 'Product',
      product_service: 'Squla',
      purpose_of_processing:
        'Deliver personalised learning journeys, maintain student access, and support parent and teacher reporting.',
      data_subjects: ['Students', 'Parents / guardians', 'Teachers'],
      personal_data: ['Identifiers', 'Contact details', 'Learning progress', 'Assessment results', 'Account credentials'],
      lawful_basis: 'Contract',
      recipients: ['Internal product team', 'Internal customer support', 'Hosting provider', 'School partner'],
      vendors: ['AWS', 'Cloudflare', 'Zendesk'],
      transfers: 1,
      transfer_mechanisms: ['Standard Contractual Clauses'],
      transfer_countries: ['United States'],
      retention_period: 'Account lifetime plus 12 months, with learning history anonymised after closure.',
      source_of_personal_data: 'Provided by parents, schools, and generated through student platform usage.',
      children_data: 1,
      special_category_data: 0,
      ai_involvement: 0,
      security_measures:
        'Role-based access controls, MFA for administrators, encryption in transit and at rest, logging of privileged access, quarterly access reviews, secure SDLC, and vendor security due diligence.',
      vendor_review_ref: 'VR-2026-012',
      vendor_review_url: 'https://compliance.futurewhiz.local/vendor/vr-2026-012',
      dpia_ref: 'DPIA-2026-004',
      dpia_url: 'https://compliance.futurewhiz.local/dpia/dpia-2026-004',
      lia_ref: '',
      lia_url: '',
      privacy_notice_ref: 'Privacy Notice section 3.2',
      privacy_notice_url: 'https://privacy.futurewhiz.local/notices/customer#student-accounts',
      security_review_ref: 'SEC-2026-019',
      security_review_url: 'https://security.futurewhiz.local/reviews/sec-2026-019',
      ai_tool_review_ref: '',
      ai_tool_review_url: '',
      status: 'approved',
      workflow_notes: 'Core customer processing. Annual review maintained by the product operations lead.',
      last_review_date: '2026-02-14',
      next_review_date: addMonths('2026-02-14', 12),
      review_interval_months: 12,
      comments_notes: 'Includes teacher-facing reporting where the school is controller for local inputs.',
      futurewhiz_role: 'controller',
      controller_name: CONTROLLER_PROFILE_DEFAULTS.company_name,
      controller_contact_details: CONTROLLER_PROFILE_DEFAULTS.email
    },
    {
      reference: 'ROPA-0002',
      activity_name: 'Parent subscription and billing management',
      short_description:
        'Manage parent accounts, subscriptions, invoices, support conversations, and payment reconciliation.',
      business_owner_email: 'noor.visser@futurewhiz.com',
      legal_reviewer_email: 'maud.jansen@futurewhiz.com',
      department: 'Customer Success',
      product_service: 'Futurewhiz Platform',
      purpose_of_processing: 'Provide subscription services, customer support, invoicing, and fraud prevention.',
      data_subjects: ['Parents / guardians'],
      personal_data: ['Identifiers', 'Contact details', 'Payment data', 'Support interactions'],
      lawful_basis: 'Contract',
      recipients: ['Internal finance team', 'Internal customer support', 'Payment provider'],
      vendors: ['Mollie', 'Zendesk'],
      transfers: 0,
      transfer_mechanisms: [],
      transfer_countries: [],
      retention_period: 'Financial records retained for 7 years; support tickets retained for 24 months.',
      source_of_personal_data: 'Provided directly by account holders during purchase and support interactions.',
      children_data: 0,
      special_category_data: 0,
      ai_involvement: 0,
      security_measures:
        'Least-privilege support access, payment tokenisation through processor, restricted finance exports, MFA, endpoint protection, and monthly access reconciliations.',
      vendor_review_ref: 'VR-2026-021',
      vendor_review_url: 'https://compliance.futurewhiz.local/vendor/vr-2026-021',
      dpia_ref: '',
      dpia_url: '',
      lia_ref: '',
      lia_url: '',
      privacy_notice_ref: 'Privacy Notice section 4.1',
      privacy_notice_url: 'https://privacy.futurewhiz.local/notices/customer#billing',
      security_review_ref: 'SEC-2026-011',
      security_review_url: 'https://security.futurewhiz.local/reviews/sec-2026-011',
      ai_tool_review_ref: '',
      ai_tool_review_url: '',
      status: 'approved',
      workflow_notes: 'Low-risk operational processing with payment provider oversight.',
      last_review_date: '2025-10-08',
      next_review_date: addMonths('2025-10-08', 12),
      review_interval_months: 12,
      comments_notes: '',
      futurewhiz_role: 'controller',
      controller_name: CONTROLLER_PROFILE_DEFAULTS.company_name,
      controller_contact_details: CONTROLLER_PROFILE_DEFAULTS.email
    },
    {
      reference: 'ROPA-0003',
      activity_name: 'Employee HR administration and wellbeing support',
      short_description:
        'Administer employment lifecycle processes, payroll inputs, leave, benefits, and mandatory workplace support cases.',
      business_owner_email: 'eva.bakker@futurewhiz.com',
      legal_reviewer_email: 'linda.vermeer@futurewhiz.com',
      department: 'People & Culture',
      product_service: 'Internal Operations',
      purpose_of_processing: 'Manage employment contracts, legal obligations, payroll coordination, and employee support.',
      data_subjects: ['Employees', 'Contractors'],
      personal_data: ['Identifiers', 'Contact details', 'HR data', 'Background check data', 'Special category data'],
      lawful_basis: 'Legal obligation',
      recipients: ['Internal people team', 'Internal finance team', 'Regulator / public authority'],
      vendors: ['Personio', 'Spendesk'],
      transfers: 1,
      transfer_mechanisms: ['Standard Contractual Clauses'],
      transfer_countries: ['United States'],
      retention_period: 'Core employment files retained for 7 years after exit; wellbeing case records retained for 2 years.',
      source_of_personal_data: 'Provided by employees, managers, recruitment partners, and statutory sources.',
      children_data: 0,
      special_category_data: 1,
      ai_involvement: 0,
      security_measures:
        'Restricted HR-only folders, enhanced access logging, encryption at rest, confidential case segregation, background-checked HR admins, and mandatory confidentiality training.',
      vendor_review_ref: 'VR-2026-030',
      vendor_review_url: 'https://compliance.futurewhiz.local/vendor/vr-2026-030',
      dpia_ref: 'DPIA-2025-015',
      dpia_url: 'https://compliance.futurewhiz.local/dpia/dpia-2025-015',
      lia_ref: '',
      lia_url: '',
      privacy_notice_ref: 'Employee Privacy Notice section 2',
      privacy_notice_url: 'https://privacy.futurewhiz.local/notices/employee#hr-admin',
      security_review_ref: 'SEC-2026-023',
      security_review_url: 'https://security.futurewhiz.local/reviews/sec-2026-023',
      ai_tool_review_ref: '',
      ai_tool_review_url: '',
      status: 'pending_legal_review',
      workflow_notes: 'Special category data requires closer review after benefits process update.',
      last_review_date: '2025-09-12',
      next_review_date: addMonths('2025-09-12', 6),
      review_interval_months: 6,
      comments_notes: 'Medical leave documents remain in a segregated sub-process.',
      futurewhiz_role: 'controller',
      controller_name: CONTROLLER_PROFILE_DEFAULTS.company_name,
      controller_contact_details: CONTROLLER_PROFILE_DEFAULTS.email
    },
    {
      reference: 'ROPA-0004',
      activity_name: 'Product analytics and behavioural telemetry',
      short_description:
        'Collect pseudonymous usage data to improve onboarding, performance, retention, and product decision-making across the Futurewhiz platform.',
      business_owner_email: 'sara.khan@futurewhiz.com',
      legal_reviewer_email: 'maud.jansen@futurewhiz.com',
      department: 'Data & Analytics',
      product_service: 'Data Platform',
      purpose_of_processing: 'Understand product usage, diagnose issues, and guide roadmap prioritisation.',
      data_subjects: ['Students', 'Parents / guardians', 'Website visitors'],
      personal_data: ['Identifiers', 'Device and usage data', 'Learning progress'],
      lawful_basis: 'Legitimate interests',
      recipients: ['Internal product team', 'Analytics provider', 'Hosting provider'],
      vendors: ['PostHog', 'BigQuery'],
      transfers: 1,
      transfer_mechanisms: ['Standard Contractual Clauses'],
      transfer_countries: ['United States'],
      retention_period: '',
      source_of_personal_data: 'Generated through app and website interaction logs.',
      children_data: 1,
      special_category_data: 0,
      ai_involvement: 0,
      security_measures:
        'Pseudonymisation of event streams, access control by team membership, controlled export permissions, retention enforcement in analytics warehouse, and audit logging for privileged queries.',
      vendor_review_ref: '',
      vendor_review_url: '',
      dpia_ref: '',
      dpia_url: '',
      lia_ref: 'LIA-2026-003',
      lia_url: 'https://compliance.futurewhiz.local/lia/lia-2026-003',
      privacy_notice_ref: 'Privacy Notice section 5.3',
      privacy_notice_url: 'https://privacy.futurewhiz.local/notices/customer#analytics',
      security_review_ref: '',
      security_review_url: '',
      ai_tool_review_ref: '',
      ai_tool_review_url: '',
      status: 'needs_update',
      workflow_notes: 'Retention wording needs clarification and vendor review linkage is missing.',
      last_review_date: '2025-04-01',
      next_review_date: '2025-10-01',
      review_interval_months: 6,
      comments_notes: 'Legacy import from spreadsheet identified inconsistent vendor names.',
      futurewhiz_role: 'controller',
      controller_name: CONTROLLER_PROFILE_DEFAULTS.company_name,
      controller_contact_details: CONTROLLER_PROFILE_DEFAULTS.email
    },
    {
      reference: 'ROPA-0005',
      activity_name: 'AI-supported practice recommendations',
      short_description:
        'Generate student practice recommendations using model-assisted ranking and teacher-configurable prompts.',
      business_owner_email: 'tom.devries@futurewhiz.com',
      legal_reviewer_email: 'linda.vermeer@futurewhiz.com',
      department: 'Product',
      product_service: 'Squla',
      purpose_of_processing:
        'Suggest next-best learning activities and reduce teacher effort in curating student practice paths.',
      data_subjects: ['Students', 'Teachers'],
      personal_data: ['Identifiers', 'Learning progress', 'Assessment results', 'Communications content'],
      lawful_basis: 'Contract',
      recipients: ['Internal product team', 'Hosting provider'],
      vendors: ['OpenAI Azure deployment', 'AWS'],
      transfers: 0,
      transfer_mechanisms: [],
      transfer_countries: [],
      retention_period: 'Model inputs retained for 30 days in application logs; derived recommendation metadata retained for 12 months.',
      source_of_personal_data: 'Generated from student learning activity, teacher inputs, and account metadata.',
      children_data: 1,
      special_category_data: 0,
      ai_involvement: 1,
      security_measures:
        'Prompt redaction for direct identifiers where feasible, segregated service accounts, environment isolation, access review for model logs, human fallback for high-impact outputs, and incident response escalation for model misuse.',
      vendor_review_ref: 'VR-2026-041',
      vendor_review_url: 'https://compliance.futurewhiz.local/vendor/vr-2026-041',
      dpia_ref: 'DPIA-2026-020',
      dpia_url: 'https://compliance.futurewhiz.local/dpia/dpia-2026-020',
      lia_ref: '',
      lia_url: '',
      privacy_notice_ref: 'Privacy Notice section 6.4',
      privacy_notice_url: 'https://privacy.futurewhiz.local/notices/customer#ai-features',
      security_review_ref: 'SEC-2026-028',
      security_review_url: 'https://security.futurewhiz.local/reviews/sec-2026-028',
      ai_tool_review_ref: 'AI-2026-007',
      ai_tool_review_url: 'https://compliance.futurewhiz.local/ai/ai-2026-007',
      status: 'pending_legal_review',
      workflow_notes: 'Waiting for final wording on teacher explainability and AI feature launch scope.',
      last_review_date: '2026-01-20',
      next_review_date: addMonths('2026-01-20', 6),
      review_interval_months: 6,
      comments_notes: 'Launch review requested before expansion to Scoyo.',
      futurewhiz_role: 'controller',
      controller_name: CONTROLLER_PROFILE_DEFAULTS.company_name,
      controller_contact_details: CONTROLLER_PROFILE_DEFAULTS.email
    },
    {
      reference: 'ROPA-0006',
      activity_name: 'Legacy school onboarding spreadsheet import',
      short_description:
        'Temporary migration process used to import older school account lists into the platform during onboarding transitions.',
      business_owner_email: 'noor.visser@futurewhiz.com',
      legal_reviewer_email: 'maud.jansen@futurewhiz.com',
      department: 'Customer Success',
      product_service: 'Futurewhiz Platform',
      purpose_of_processing: 'Support legacy onboarding migrations where schools still provide spreadsheet-based user data.',
      data_subjects: ['Students', 'Teachers', 'School administrators'],
      personal_data: ['Identifiers', 'Contact details', 'Account credentials'],
      lawful_basis: 'Contract',
      recipients: ['Internal customer support', 'Internal product team'],
      vendors: ['Secure SFTP provider'],
      transfers: 0,
      transfer_mechanisms: [],
      transfer_countries: [],
      retention_period: '',
      source_of_personal_data: 'Provided by school contacts during onboarding.',
      children_data: 1,
      special_category_data: 0,
      ai_involvement: 0,
      security_measures: '',
      vendor_review_ref: '',
      vendor_review_url: '',
      dpia_ref: '',
      dpia_url: '',
      lia_ref: '',
      lia_url: '',
      privacy_notice_ref: '',
      privacy_notice_url: '',
      security_review_ref: '',
      security_review_url: '',
      ai_tool_review_ref: '',
      ai_tool_review_url: '',
      status: 'draft',
      workflow_notes: 'Imported from legacy spreadsheet and still requires remediation.',
      last_review_date: '',
      next_review_date: todayIsoDate(),
      review_interval_months: 6,
      comments_notes: 'Good example of a legacy record that needs structured completion.',
      futurewhiz_role: 'processor',
      controller_name: 'Partner school',
      controller_contact_details: 'School onboarding contact on file'
    }
  ].map((activity) => ({
    business_process: '',
    processes_personal_data: 1,
    futurewhiz_internal_use: '',
    processing_lawful: 1,
    processing_type: '',
    controller_name: CONTROLLER_PROFILE_DEFAULTS.company_name,
    controller_contact_details: CONTROLLER_PROFILE_DEFAULTS.email,
    joint_controller_name: '',
    joint_controller_contact_details: '',
    controller_representative_name: '',
    controller_representative_contact_details: '',
    dpo_name: '',
    dpo_contact_details: '',
    futurewhiz_role: 'controller',
    retention_period_internal: '',
    retention_enforcement: '',
    old_data_deletion_details: '',
    data_within_eu: 1,
    processor_agreement_signed: 0,
    legal_remarks: '',
    action_required: '',
    tia_performed: 0,
    ...activity
  }));

  demoActivities[0].joint_controller_name = 'School partner';
  demoActivities[0].joint_controller_contact_details = 'School contract contact on file';
  demoActivities[2].dpo_name = 'Linda Vermeer';
  demoActivities[2].dpo_contact_details = 'linda.vermeer@futurewhiz.com';
  demoActivities[4].dpo_name = 'Maud Jansen';
  demoActivities[4].dpo_contact_details = 'maud.jansen@futurewhiz.com';

  const insertActivity = compileStatement(
    database,
    `
      INSERT INTO activities (
        reference_code, activity_name, short_description, business_owner_id, business_owner_name, business_owner_email,
        business_process, processes_personal_data, futurewhiz_internal_use, processing_lawful, processing_type,
        controller_name, controller_contact_details, joint_controller_name, joint_controller_contact_details,
        controller_representative_name, controller_representative_contact_details, dpo_name, dpo_contact_details,
        legal_reviewer_id, legal_reviewer_name, legal_reviewer_email, department, product_service, purpose_of_processing,
        data_subject_categories_json, personal_data_categories_json, lawful_basis, recipient_categories_json,
        processors_vendors_json, international_transfers, transfer_mechanisms_json, transfer_countries_json,
        retention_period, retention_period_internal, retention_enforcement, old_data_deletion_details, data_within_eu,
        processor_agreement_signed, source_of_personal_data, children_data, special_category_data, ai_involvement, futurewhiz_role,
        security_measures, legal_remarks, action_required, tia_performed, vendor_review_ref, vendor_review_url, dpia_ref, dpia_url, lia_ref, lia_url,
        privacy_notice_ref, privacy_notice_url, security_review_ref, security_review_url, ai_tool_review_ref,
        ai_tool_review_url, status, workflow_notes, review_interval_months, last_updated_by_id, last_updated_by_name,
        last_updated_by_email, last_updated_at, last_review_date, next_review_date, comments_notes, created_by_id,
        created_by_name, created_by_email, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  const insertChange = compileStatement(
    database,
    `
      INSERT INTO activity_change_log (
        activity_id, actor_id, actor_name, actor_email, event_type, field_name, old_value, new_value, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  const insertReminder = compileStatement(
    database,
    `
      INSERT INTO activity_reminders (activity_id, trigger_source, scheduled_for, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  );

  for (const activity of demoActivities) {
    const owner = userByEmail.get(activity.business_owner_email);
    const reviewer = userByEmail.get(activity.legal_reviewer_email);
    const editor = reviewer || owner;
    const result = await insertActivity.run(
      activity.reference,
      activity.activity_name,
      activity.short_description,
      owner?.id || null,
      owner?.name || '',
      owner?.email || activity.business_owner_email,
      activity.business_process,
      activity.processes_personal_data,
      activity.futurewhiz_internal_use,
      activity.processing_lawful,
      activity.processing_type,
      activity.controller_name,
      activity.controller_contact_details,
      activity.joint_controller_name,
      activity.joint_controller_contact_details,
      activity.controller_representative_name,
      activity.controller_representative_contact_details,
      activity.dpo_name,
      activity.dpo_contact_details,
      reviewer?.id || null,
      reviewer?.name || '',
      reviewer?.email || activity.legal_reviewer_email,
      activity.department,
      activity.product_service,
      activity.purpose_of_processing,
      stringifyJsonArray(activity.data_subjects),
      stringifyJsonArray(activity.personal_data),
      activity.lawful_basis,
      stringifyJsonArray(activity.recipients),
      stringifyJsonArray(activity.vendors),
      activity.transfers,
      stringifyJsonArray(activity.transfer_mechanisms),
      stringifyJsonArray(activity.transfer_countries),
      activity.retention_period,
      activity.retention_period_internal,
      activity.retention_enforcement,
      activity.old_data_deletion_details,
      activity.data_within_eu,
      activity.processor_agreement_signed,
      activity.source_of_personal_data,
      activity.children_data,
      activity.special_category_data,
      activity.ai_involvement,
      activity.futurewhiz_role,
      activity.security_measures,
      activity.legal_remarks,
      activity.action_required,
      activity.tia_performed,
      activity.vendor_review_ref,
      activity.vendor_review_url,
      activity.dpia_ref,
      activity.dpia_url,
      activity.lia_ref,
      activity.lia_url,
      activity.privacy_notice_ref,
      activity.privacy_notice_url,
      activity.security_review_ref,
      activity.security_review_url,
      activity.ai_tool_review_ref,
      activity.ai_tool_review_url,
      activity.status,
      activity.workflow_notes,
      activity.review_interval_months,
      editor?.id || null,
      editor?.name || '',
      editor?.email || '',
      createdAt,
      activity.last_review_date,
      activity.next_review_date,
      activity.comments_notes,
      owner?.id || null,
      owner?.name || '',
      owner?.email || '',
      createdAt
    );

    await insertChange.run(
      result.lastInsertRowid,
      owner?.id || null,
      owner?.name || '',
      owner?.email || '',
      'created',
      null,
      null,
      STATUS_OPTIONS.find((item) => item.value === activity.status)?.label || activity.status,
      'Seeded demo activity',
      createdAt
    );

    await insertReminder.run(
      result.lastInsertRowid,
      'scheduled_review',
      activity.next_review_date || todayIsoDate(),
      activity.next_review_date && activity.next_review_date < todayIsoDate() ? 'overdue' : 'scheduled',
      'Initial review reminder',
      createdAt,
      createdAt
    );
  }

  const activityRows = await compileStatement(
    database,
    'SELECT id, reference_code, activity_name FROM activities ORDER BY id ASC'
  ).all();

  await compileStatement(
    database,
    `
      INSERT INTO intake_requests (
        request_code, trigger_type, request_type, title, summary, requester_id, requester_name, requester_email,
        department, product_service, linked_activity_id, linked_activity_reference, outcome_activity_id,
        status, material_change, created_at, resolved_at, resolution_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    'INTAKE-0001',
    'new_ai_feature',
    'update_existing',
    'Expand AI recommendations to Scoyo teacher dashboard',
    'Product team requested a review because the recommendation engine will now surface teacher-facing summaries.',
    userByEmail.get('tom.devries@futurewhiz.com')?.id || null,
    'Tom de Vries',
    'tom.devries@futurewhiz.com',
    'Product',
    'Scoyo',
    activityRows.find((row) => row.reference_code === 'ROPA-0005')?.id || null,
    'ROPA-0005',
    activityRows.find((row) => row.reference_code === 'ROPA-0005')?.id || null,
    'submitted',
    1,
    nowIso(),
    '',
    ''
  );
}

async function ensureActivityColumns(database) {
  const rows = await compileStatement(database, 'PRAGMA table_info(activities)').all();
  const existingColumns = new Set(rows.map((row) => row.name));
  const additions = [
    ['controller_name', `TEXT NOT NULL DEFAULT '${CONTROLLER_PROFILE_DEFAULTS.company_name.replaceAll("'", "''")}'`],
    [
      'controller_contact_details',
      `TEXT NOT NULL DEFAULT '${CONTROLLER_PROFILE_DEFAULTS.email.replaceAll("'", "''")}'`
    ],
    ['joint_controller_name', `TEXT NOT NULL DEFAULT ''`],
    ['joint_controller_contact_details', `TEXT NOT NULL DEFAULT ''`],
    ['controller_representative_name', `TEXT NOT NULL DEFAULT ''`],
    ['controller_representative_contact_details', `TEXT NOT NULL DEFAULT ''`],
    ['dpo_name', `TEXT NOT NULL DEFAULT '${CONTROLLER_PROFILE_DEFAULTS.contact_name.replaceAll("'", "''")}'`],
    ['dpo_contact_details', `TEXT NOT NULL DEFAULT '${CONTROLLER_PROFILE_DEFAULTS.email.replaceAll("'", "''")}'`],
    ['futurewhiz_role', `TEXT NOT NULL DEFAULT 'controller'`],
    ['business_process', `TEXT NOT NULL DEFAULT ''`],
    ['processes_personal_data', `INTEGER NOT NULL DEFAULT 1`],
    ['futurewhiz_internal_use', `TEXT NOT NULL DEFAULT ''`],
    ['processing_lawful', `INTEGER NOT NULL DEFAULT 1`],
    ['processing_type', `TEXT NOT NULL DEFAULT ''`],
    ['retention_period_internal', `TEXT NOT NULL DEFAULT ''`],
    ['retention_enforcement', `TEXT NOT NULL DEFAULT ''`],
    ['old_data_deletion_details', `TEXT NOT NULL DEFAULT ''`],
    ['data_within_eu', `INTEGER NOT NULL DEFAULT 1`],
    ['processor_agreement_signed', `INTEGER NOT NULL DEFAULT 0`],
    ['legal_remarks', `TEXT NOT NULL DEFAULT ''`],
    ['action_required', `TEXT NOT NULL DEFAULT ''`],
    ['tia_performed', `INTEGER NOT NULL DEFAULT 0`]
  ];

  for (const [name, definition] of additions) {
    if (!existingColumns.has(name)) {
      await exec(database, `ALTER TABLE activities ADD COLUMN ${name} ${definition}`);
    }
  }

  await compileStatement(
    database,
    `
      UPDATE activities
      SET
        controller_name = COALESCE(NULLIF(controller_name, ''), ?),
        controller_contact_details = COALESCE(NULLIF(controller_contact_details, ''), ?),
        dpo_name = COALESCE(NULLIF(dpo_name, ''), ?),
        dpo_contact_details = COALESCE(NULLIF(dpo_contact_details, ''), ?),
        futurewhiz_role = COALESCE(NULLIF(futurewhiz_role, ''), 'controller'),
        business_process = COALESCE(NULLIF(business_process, ''), activity_name),
        processes_personal_data = COALESCE(processes_personal_data, 1),
        futurewhiz_internal_use = COALESCE(NULLIF(futurewhiz_internal_use, ''), purpose_of_processing),
        processing_lawful = COALESCE(processing_lawful, CASE WHEN lawful_basis IS NOT NULL AND lawful_basis != '' THEN 1 ELSE 0 END),
        processing_type = COALESCE(processing_type, ''),
        retention_period_internal = COALESCE(NULLIF(retention_period_internal, ''), COALESCE(retention_period, '')),
        retention_enforcement = COALESCE(retention_enforcement, ''),
        old_data_deletion_details = COALESCE(old_data_deletion_details, ''),
        data_within_eu = COALESCE(data_within_eu, CASE WHEN international_transfers = 1 THEN 0 ELSE 1 END),
        processor_agreement_signed = COALESCE(processor_agreement_signed, CASE WHEN vendor_review_ref IS NOT NULL AND vendor_review_ref != '' THEN 1 ELSE 0 END),
        legal_remarks = COALESCE(legal_remarks, ''),
        action_required = COALESCE(action_required, ''),
        tia_performed = COALESCE(tia_performed, CASE WHEN international_transfers = 1 THEN 1 ELSE 0 END)
    `
  ).run(
    CONTROLLER_PROFILE_DEFAULTS.company_name,
    CONTROLLER_PROFILE_DEFAULTS.email,
    CONTROLLER_PROFILE_DEFAULTS.contact_name,
    CONTROLLER_PROFILE_DEFAULTS.email
  );
}

export async function initDb() {
  if (db) return db;

  ensureDir(DB_PATH);
  db = await openDatabase(DB_PATH);

  await exec(db, 'PRAGMA journal_mode = WAL');
  await exec(db, 'PRAGMA foreign_keys = ON');

  await exec(
    db,
    `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        department TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vocabulary_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_key TEXT NOT NULL,
        value_key TEXT NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS controller_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL DEFAULT 'Futurewhiz B.V.',
        contact_name TEXT NOT NULL DEFAULT 'Futurewhiz Legal & Privacy Team',
        address TEXT NOT NULL DEFAULT '',
        phone_number TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT 'privacy@futurewhiz.com',
        chamber_of_commerce TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_code TEXT NOT NULL UNIQUE,
        activity_name TEXT NOT NULL,
        short_description TEXT NOT NULL,
        business_owner_id INTEGER,
        business_owner_name TEXT,
        business_owner_email TEXT NOT NULL,
        business_process TEXT NOT NULL DEFAULT '',
        processes_personal_data INTEGER NOT NULL DEFAULT 1,
        futurewhiz_internal_use TEXT NOT NULL DEFAULT '',
        processing_lawful INTEGER NOT NULL DEFAULT 1,
        processing_type TEXT NOT NULL DEFAULT '',
        controller_name TEXT NOT NULL DEFAULT 'Futurewhiz B.V.',
        controller_contact_details TEXT NOT NULL DEFAULT 'privacy@futurewhiz.com',
        joint_controller_name TEXT NOT NULL DEFAULT '',
        joint_controller_contact_details TEXT NOT NULL DEFAULT '',
        controller_representative_name TEXT NOT NULL DEFAULT '',
        controller_representative_contact_details TEXT NOT NULL DEFAULT '',
        dpo_name TEXT NOT NULL DEFAULT 'Futurewhiz Legal & Privacy Team',
        dpo_contact_details TEXT NOT NULL DEFAULT 'privacy@futurewhiz.com',
        legal_reviewer_id INTEGER,
        legal_reviewer_name TEXT,
        legal_reviewer_email TEXT,
        department TEXT NOT NULL,
        product_service TEXT NOT NULL,
        purpose_of_processing TEXT NOT NULL,
        data_subject_categories_json TEXT NOT NULL DEFAULT '[]',
        personal_data_categories_json TEXT NOT NULL DEFAULT '[]',
        lawful_basis TEXT NOT NULL,
        recipient_categories_json TEXT NOT NULL DEFAULT '[]',
        processors_vendors_json TEXT NOT NULL DEFAULT '[]',
        international_transfers INTEGER NOT NULL DEFAULT 0,
        transfer_mechanisms_json TEXT NOT NULL DEFAULT '[]',
        transfer_countries_json TEXT NOT NULL DEFAULT '[]',
        retention_period TEXT,
        retention_period_internal TEXT NOT NULL DEFAULT '',
        retention_enforcement TEXT NOT NULL DEFAULT '',
        old_data_deletion_details TEXT NOT NULL DEFAULT '',
        data_within_eu INTEGER NOT NULL DEFAULT 1,
        processor_agreement_signed INTEGER NOT NULL DEFAULT 0,
        source_of_personal_data TEXT,
        children_data INTEGER NOT NULL DEFAULT 0,
        special_category_data INTEGER NOT NULL DEFAULT 0,
        ai_involvement INTEGER NOT NULL DEFAULT 0,
        futurewhiz_role TEXT NOT NULL DEFAULT 'controller',
        security_measures TEXT NOT NULL DEFAULT '',
        legal_remarks TEXT NOT NULL DEFAULT '',
        action_required TEXT NOT NULL DEFAULT '',
        tia_performed INTEGER NOT NULL DEFAULT 0,
        vendor_review_ref TEXT,
        vendor_review_url TEXT,
        dpia_ref TEXT,
        dpia_url TEXT,
        lia_ref TEXT,
        lia_url TEXT,
        privacy_notice_ref TEXT,
        privacy_notice_url TEXT,
        security_review_ref TEXT,
        security_review_url TEXT,
        ai_tool_review_ref TEXT,
        ai_tool_review_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        workflow_notes TEXT,
        review_interval_months INTEGER NOT NULL DEFAULT 12,
        last_updated_by_id INTEGER,
        last_updated_by_name TEXT,
        last_updated_by_email TEXT,
        last_updated_at TEXT NOT NULL,
        last_review_date TEXT,
        next_review_date TEXT,
        comments_notes TEXT,
        created_by_id INTEGER,
        created_by_name TEXT,
        created_by_email TEXT,
        created_at TEXT NOT NULL,
        archived_at TEXT,
        FOREIGN KEY (business_owner_id) REFERENCES users(id),
        FOREIGN KEY (legal_reviewer_id) REFERENCES users(id),
        FOREIGN KEY (created_by_id) REFERENCES users(id),
        FOREIGN KEY (last_updated_by_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS activity_change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        actor_id INTEGER,
        actor_name TEXT,
        actor_email TEXT NOT NULL,
        event_type TEXT NOT NULL,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS activity_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        trigger_source TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS intake_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_code TEXT NOT NULL UNIQUE,
        trigger_type TEXT NOT NULL,
        request_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        requester_id INTEGER,
        requester_name TEXT,
        requester_email TEXT NOT NULL,
        department TEXT,
        product_service TEXT,
        linked_activity_id INTEGER,
        linked_activity_reference TEXT,
        outcome_activity_id INTEGER,
        status TEXT NOT NULL DEFAULT 'submitted',
        material_change INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_notes TEXT,
        FOREIGN KEY (requester_id) REFERENCES users(id),
        FOREIGN KEY (linked_activity_id) REFERENCES activities(id),
        FOREIGN KEY (outcome_activity_id) REFERENCES activities(id)
      );

      CREATE TABLE IF NOT EXISTS activity_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        attachment_type TEXT NOT NULL,
        label TEXT,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT,
        size_bytes INTEGER,
        uploaded_by_email TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS security_measure_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        created_by_email TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vocab_group ON vocabulary_values(group_key, active, sort_order);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, active);
      CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
      CREATE INDEX IF NOT EXISTS idx_activities_department ON activities(department);
      CREATE INDEX IF NOT EXISTS idx_activities_product ON activities(product_service);
      CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities(business_owner_email);
      CREATE INDEX IF NOT EXISTS idx_activities_review ON activities(next_review_date);
      CREATE INDEX IF NOT EXISTS idx_change_log_activity ON activity_change_log(activity_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reminders_activity ON activity_reminders(activity_id, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_intake_created ON intake_requests(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_activity ON activity_attachments(activity_id, uploaded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_security_measure_category ON security_measure_library(category, sort_order, title);
    `
  );

  await ensureActivityColumns(db);
  await seedVocabulary(db);
  await seedUsers(db);
  await ensureControllerProfile(db);
  await ensureSecurityMeasureLibrary(db);
  await seedActivities(db);

  return db;
}

export function getDb() {
  return {
    prepare(sql) {
      if (!db) {
        throw new Error('Database not initialised. Call initDb() first.');
      }
      return compileStatement(db, sql);
    }
  };
}
