export const ROLE_OPTIONS = [
  { value: 'business', label: 'Business user' },
  { value: 'legal', label: 'Legal/privacy reviewer' },
  { value: 'admin', label: 'Admin' }
];

export const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_business_input', label: 'Pending business input' },
  { value: 'pending_legal_review', label: 'Pending legal review' },
  { value: 'approved', label: 'Approved' },
  { value: 'needs_update', label: 'Needs update' },
  { value: 'archived', label: 'Archived' }
];

export const REVIEW_INTERVAL_OPTIONS = [
  { value: 6, label: 'Every 6 months' },
  { value: 12, label: 'Every 12 months' }
];

export const INTAKE_TRIGGER_OPTIONS = [
  { value: 'new_tool', label: 'New tool' },
  { value: 'new_vendor', label: 'New vendor' },
  { value: 'new_feature', label: 'New feature' },
  { value: 'new_processing_purpose', label: 'New processing purpose' },
  { value: 'material_change', label: 'Material change to existing processing activity' },
  { value: 'new_ai_feature', label: 'New AI feature' },
  { value: 'new_transfer_outside_eea', label: 'New transfer outside EEA' },
  { value: 'new_data_category', label: 'New data category' },
  { value: 'retention_change', label: 'Change in retention logic' },
  { value: 'product_change', label: 'Product change' }
];

export const INTAKE_REQUEST_TYPE_OPTIONS = [
  { value: 'new_activity', label: 'Create a new processing activity draft' },
  { value: 'update_existing', label: 'Flag an existing record for update' }
];

export const ATTACHMENT_TYPE_OPTIONS = [
  { value: 'vendor_file', label: 'Vendor file / DPA' },
  { value: 'dpia', label: 'DPIA' },
  { value: 'lia', label: 'LIA' },
  { value: 'privacy_notice', label: 'Privacy notice section' },
  { value: 'security_review', label: 'Security review' },
  { value: 'ai_tool_review', label: 'AI tool review' },
  { value: 'other', label: 'Other supporting file' }
];

export const BOOLEAN_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

export const ROPA_CONTACT_DEFAULTS = {
  controller_name: 'Futurewhiz B.V.',
  controller_contact_details: 'privacy@futurewhiz.com',
  joint_controller_name: '',
  joint_controller_contact_details: '',
  controller_representative_name: '',
  controller_representative_contact_details: '',
  dpo_name: 'Futurewhiz Legal & Privacy Team',
  dpo_contact_details: 'privacy@futurewhiz.com'
};

export const CONTROLLED_VOCABULARY_SEEDS = [
  {
    groupKey: 'department',
    items: [
      'Product',
      'Engineering',
      'Customer Success',
      'Marketing',
      'People & Culture',
      'Finance',
      'Data & Analytics',
      'Security',
      'Legal & Privacy'
    ]
  },
  {
    groupKey: 'product_service',
    items: ['Squla', 'Scoyo', 'WRTS', 'Futurewhiz Platform', 'Internal Operations', 'Data Platform']
  },
  {
    groupKey: 'lawful_basis',
    items: [
      'Contract',
      'Legitimate interests',
      'Legal obligation',
      'Consent',
      'Vital interests',
      'Public task'
    ]
  },
  {
    groupKey: 'data_subject_category',
    items: [
      'Students',
      'Parents / guardians',
      'Teachers',
      'School administrators',
      'Employees',
      'Contractors',
      'Prospects',
      'Website visitors'
    ]
  },
  {
    groupKey: 'personal_data_category',
    items: [
      'Identifiers',
      'Contact details',
      'Account credentials',
      'Learning progress',
      'Assessment results',
      'Support interactions',
      'Device and usage data',
      'Payment data',
      'HR data',
      'Background check data',
      'Communications content',
      'Special category data'
    ]
  },
  {
    groupKey: 'recipient_category',
    items: [
      'Internal product team',
      'Internal customer support',
      'Internal finance team',
      'Internal people team',
      'Hosting provider',
      'Analytics provider',
      'Payment provider',
      'Customer support tool',
      'School partner',
      'Regulator / public authority'
    ]
  },
  {
    groupKey: 'transfer_mechanism',
    items: ['Standard Contractual Clauses', 'Adequacy decision', 'UK Addendum / IDTA', 'Article 49 derogation']
  },
  {
    groupKey: 'activity_status',
    items: STATUS_OPTIONS.map((status) => status.label)
  },
  {
    groupKey: 'intake_trigger',
    items: INTAKE_TRIGGER_OPTIONS.map((trigger) => trigger.label)
  }
];

export const ACTIVITY_FIELD_META = [
  { key: 'activity_name', label: 'Activity name', type: 'text' },
  { key: 'short_description', label: 'Short description', type: 'text' },
  { key: 'controller_name', label: 'Controller name', type: 'text' },
  { key: 'controller_contact_details', label: 'Controller contact details', type: 'text' },
  { key: 'joint_controller_name', label: 'Joint controller name', type: 'text' },
  { key: 'joint_controller_contact_details', label: 'Joint controller contact details', type: 'text' },
  { key: 'controller_representative_name', label: 'Controller representative name', type: 'text' },
  { key: 'controller_representative_contact_details', label: 'Controller representative contact details', type: 'text' },
  { key: 'dpo_name', label: 'Data Protection Officer name', type: 'text' },
  { key: 'dpo_contact_details', label: 'Data Protection Officer contact details', type: 'text' },
  { key: 'business_owner_name', label: 'Business owner', type: 'text' },
  { key: 'business_owner_email', label: 'Business owner email', type: 'text' },
  { key: 'legal_reviewer_name', label: 'Legal reviewer', type: 'text' },
  { key: 'legal_reviewer_email', label: 'Legal reviewer email', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'product_service', label: 'Product / service', type: 'text' },
  { key: 'purpose_of_processing', label: 'Purpose of processing', type: 'text' },
  { key: 'data_subject_categories_json', label: 'Categories of data subjects', type: 'json-array' },
  { key: 'personal_data_categories_json', label: 'Categories of personal data', type: 'json-array' },
  { key: 'lawful_basis', label: 'Lawful basis', type: 'text' },
  { key: 'recipient_categories_json', label: 'Categories of recipients', type: 'json-array' },
  { key: 'processors_vendors_json', label: 'Processors / vendors involved', type: 'json-array' },
  { key: 'international_transfers', label: 'International transfers', type: 'boolean' },
  { key: 'transfer_mechanisms_json', label: 'Transfer mechanisms / safeguards', type: 'json-array' },
  { key: 'transfer_countries_json', label: 'Transfer countries', type: 'json-array' },
  { key: 'retention_period', label: 'Retention period', type: 'text' },
  { key: 'source_of_personal_data', label: 'Source of personal data', type: 'text' },
  { key: 'children_data', label: 'Children’s data involved', type: 'boolean' },
  { key: 'special_category_data', label: 'Special category data involved', type: 'boolean' },
  { key: 'ai_involvement', label: 'AI systems involved', type: 'boolean' },
  { key: 'security_measures', label: 'Security measures', type: 'text' },
  { key: 'vendor_review_ref', label: 'Linked vendor review / DPA ID', type: 'text' },
  { key: 'vendor_review_url', label: 'Linked vendor review / DPA URL', type: 'text' },
  { key: 'dpia_ref', label: 'Linked DPIA ID', type: 'text' },
  { key: 'dpia_url', label: 'Linked DPIA URL', type: 'text' },
  { key: 'lia_ref', label: 'Linked LIA ID', type: 'text' },
  { key: 'lia_url', label: 'Linked LIA URL', type: 'text' },
  { key: 'privacy_notice_ref', label: 'Linked privacy notice section', type: 'text' },
  { key: 'privacy_notice_url', label: 'Linked privacy notice URL', type: 'text' },
  { key: 'security_review_ref', label: 'Linked security review ID', type: 'text' },
  { key: 'security_review_url', label: 'Linked security review URL', type: 'text' },
  { key: 'ai_tool_review_ref', label: 'Linked AI tool review ID', type: 'text' },
  { key: 'ai_tool_review_url', label: 'Linked AI tool review URL', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'workflow_notes', label: 'Workflow notes', type: 'text' },
  { key: 'last_review_date', label: 'Last review date', type: 'date' },
  { key: 'next_review_date', label: 'Next review date', type: 'date' },
  { key: 'review_interval_months', label: 'Review cadence', type: 'text' },
  { key: 'comments_notes', label: 'Comments / notes', type: 'text' }
];

export const REQUIRED_ACTIVITY_FIELDS = [
  'activity_name',
  'short_description',
  'business_owner_email',
  'department',
  'product_service',
  'purpose_of_processing',
  'lawful_basis',
  'security_measures',
  'status'
];

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.txt',
  '.xls',
  '.xlsx',
  '.zip'
]);
