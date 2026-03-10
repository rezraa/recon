/**
 * Cross-domain synthetic personas for testing domain-agnostic scoring.
 * Each persona has: resume (skills + experience + titles), relevant job descriptions, irrelevant job descriptions.
 * These are TEST FIXTURES only — production derives everything from the real user's resume.
 */

import type { ParsedResume } from '../resumeTypes'

export interface PersonaJob {
  title: string
  company: string
  description: string
}

export interface Persona {
  name: string
  resume: ParsedResume
  relevantJobs: PersonaJob[]
  irrelevantJobs: PersonaJob[]
}

// ─── Software Engineer (SDET-like) ───────────────────────────────────────────

const softwareEngineer: Persona = {
  name: 'Software Engineer',
  resume: {
    skills: ['TypeScript', 'Selenium', 'AWS', 'Docker', 'CI/CD', 'React', 'Node.js', 'PostgreSQL', 'Vitest', 'Git'],
    experience: [
      { title: 'Senior SDET', company: 'Tech Corp', years: 5 },
      { title: 'Software Engineer', company: 'Startup Inc', years: 3 },
    ],
    jobTitles: ['Senior SDET', 'Software Engineer'],
  },
  relevantJobs: [
    {
      title: 'Senior Software Engineer',
      company: 'Acme Tech',
      description: 'We are looking for a Senior Software Engineer with experience in TypeScript, React, and Node.js. You will build scalable web applications using PostgreSQL and deploy with Docker and AWS. CI/CD pipeline experience required. Must have strong Git workflow skills and experience writing automated tests with frameworks like Vitest or Jest.',
    },
    {
      title: 'SDET II',
      company: 'QualitySoft',
      description: 'Join our quality engineering team as an SDET II. You will design and implement automated test suites using Selenium and TypeScript. Experience with CI/CD pipelines, Docker containerization, and AWS cloud services required. Knowledge of React testing patterns and Node.js backend testing is a plus.',
    },
    {
      title: 'Full Stack Developer',
      company: 'WebScale Inc',
      description: 'Full Stack Developer needed to build and maintain web applications. Tech stack includes TypeScript, React, Node.js, and PostgreSQL. Experience with Docker, AWS deployment, and automated testing required. Git version control and CI/CD practices are essential.',
    },
  ],
  irrelevantJobs: [
    {
      title: 'ICU Registered Nurse',
      company: 'City Hospital',
      description: 'Seeking an ICU Registered Nurse with ACLS certification. Must have experience with patient assessment, IV therapy, ventilator management, and Epic EMR documentation. Critical care experience required. BLS and ACLS certifications mandatory. Night shift availability needed.',
    },
    {
      title: 'Journeyman Electrician',
      company: 'PowerGrid Services',
      description: 'Licensed Journeyman Electrician needed for commercial and industrial projects. Must have knowledge of NEC Code, PLC programming, motor controls, and OSHA safety standards. Experience with conduit bending, wire pulling, and panel installation required. Valid state electrical license mandatory.',
    },
  ],
}

// ─── Registered Nurse (ICU) ──────────────────────────────────────────────────

const registeredNurse: Persona = {
  name: 'Registered Nurse',
  resume: {
    skills: ['Patient Assessment', 'IV Therapy', 'Epic EMR', 'ACLS', 'Critical Care', 'Ventilator Management', 'BLS', 'Medication Administration', 'Care Planning', 'Telemetry'],
    experience: [
      { title: 'ICU Registered Nurse', company: 'Kaiser Permanente', years: 6 },
      { title: 'Staff Nurse', company: 'Community Medical Center', years: 3 },
    ],
    jobTitles: ['ICU Registered Nurse', 'Staff Nurse'],
  },
  relevantJobs: [
    {
      title: 'Critical Care RN',
      company: 'Stanford Health',
      description: 'Critical Care RN needed for our intensive care unit. Must have active RN license, ACLS and BLS certifications. Experience with patient assessment, IV therapy, ventilator management, and Epic EMR required. Critical care nursing experience of 3+ years preferred. Telemetry monitoring and medication administration skills essential.',
    },
    {
      title: 'ICU Nurse',
      company: 'Mayo Clinic',
      description: 'ICU Nurse position available. Requirements include ACLS certification, patient assessment skills, IV therapy competency, and ventilator management experience. Must be proficient with Epic EMR system. Critical care experience and care planning abilities required. BLS certification mandatory.',
    },
    {
      title: 'Registered Nurse - Acute Care',
      company: 'Providence Health',
      description: 'Registered Nurse for acute care unit. Requires active nursing license, BLS and ACLS certifications. Experience with patient assessment, medication administration, IV therapy, and electronic health records (Epic EMR preferred). Telemetry monitoring and care planning skills required.',
    },
  ],
  irrelevantJobs: [
    {
      title: 'Senior Software Engineer',
      company: 'Google',
      description: 'Senior Software Engineer to build distributed systems. Requires TypeScript, React, Node.js, and PostgreSQL experience. Docker and AWS cloud deployment skills needed. CI/CD pipeline management and automated testing with Selenium or similar frameworks required.',
    },
    {
      title: 'Marketing Manager',
      company: 'HubSpot',
      description: 'Marketing Manager to lead digital campaigns. Must have experience with SEO, Google Analytics, HubSpot CRM, and campaign management. Skills in content marketing, social media strategy, and A/B testing required. Google Ads certification preferred.',
    },
  ],
}

// ─── Journeyman Electrician ──────────────────────────────────────────────────

const journeymanElectrician: Persona = {
  name: 'Journeyman Electrician',
  resume: {
    skills: ['NEC Code', 'PLC Programming', 'Motor Controls', 'OSHA Safety', 'Conduit Bending', 'Blueprint Reading', 'Panel Installation', 'Troubleshooting', 'Wire Pulling', '480V Systems'],
    experience: [
      { title: 'Journeyman Electrician', company: 'Miller Electric', years: 8 },
      { title: 'Apprentice Electrician', company: 'Local IBEW', years: 4 },
    ],
    jobTitles: ['Journeyman Electrician', 'Apprentice Electrician'],
  },
  relevantJobs: [
    {
      title: 'Industrial Electrician',
      company: 'Siemens',
      description: 'Industrial Electrician for manufacturing facility. Must have experience with PLC programming, motor controls, and 480V systems. NEC Code knowledge required. OSHA safety certification mandatory. Blueprint reading, conduit bending, and panel installation skills essential. Troubleshooting abilities and wire pulling experience needed.',
    },
    {
      title: 'Commercial Electrician',
      company: 'Pike Electric',
      description: 'Commercial Electrician for large-scale projects. Requirements include NEC Code compliance, conduit bending, wire pulling, and panel installation. Blueprint reading and troubleshooting skills required. OSHA safety training mandatory. Experience with motor controls and PLC programming is a plus.',
    },
    {
      title: 'Maintenance Electrician',
      company: 'Tesla Gigafactory',
      description: 'Maintenance Electrician to support automated production lines. Must have PLC programming experience, motor controls knowledge, and 480V systems proficiency. NEC Code compliance and OSHA safety standards required. Troubleshooting and conduit bending skills essential. Blueprint reading ability needed.',
    },
  ],
  irrelevantJobs: [
    {
      title: 'Data Analyst',
      company: 'Meta',
      description: 'Data Analyst to drive insights from user behavior data. Requires SQL, Python, Tableau, and statistical analysis skills. Experience with A/B testing, data visualization, and machine learning fundamentals. Knowledge of data warehousing and ETL pipelines preferred.',
    },
    {
      title: 'Registered Nurse',
      company: 'Cleveland Clinic',
      description: 'Registered Nurse for our cardiac unit. Must have ACLS and BLS certifications. Experience with patient assessment, IV therapy, Epic EMR, and telemetry monitoring required. Medication administration and care planning skills essential.',
    },
  ],
}

// ─── Marketing Manager ───────────────────────────────────────────────────────

const marketingManager: Persona = {
  name: 'Marketing Manager',
  resume: {
    skills: ['SEO', 'Google Analytics', 'HubSpot', 'Campaign Management', 'CRM', 'Content Marketing', 'A/B Testing', 'Social Media Strategy', 'Google Ads', 'Email Marketing'],
    experience: [
      { title: 'Senior Marketing Manager', company: 'Salesforce', years: 5 },
      { title: 'Marketing Coordinator', company: 'Local Agency', years: 3 },
    ],
    jobTitles: ['Senior Marketing Manager', 'Marketing Coordinator'],
  },
  relevantJobs: [
    {
      title: 'Digital Marketing Manager',
      company: 'Shopify',
      description: 'Digital Marketing Manager to lead online campaigns. Must have experience with SEO, Google Analytics, and Google Ads. HubSpot CRM proficiency required. Skills in campaign management, A/B testing, content marketing, and email marketing essential. Social media strategy experience preferred.',
    },
    {
      title: 'Growth Marketing Lead',
      company: 'Stripe',
      description: 'Growth Marketing Lead to drive customer acquisition. Requires expertise in SEO, Google Analytics, campaign management, and CRM platforms like HubSpot. A/B testing, content marketing, and email marketing skills required. Google Ads certification and social media strategy experience preferred.',
    },
    {
      title: 'Marketing Manager',
      company: 'Adobe',
      description: 'Marketing Manager for our digital experience platform. Must have SEO expertise, Google Analytics proficiency, and HubSpot or similar CRM experience. Campaign management, content marketing, and A/B testing skills required. Experience with Google Ads, email marketing, and social media strategy.',
    },
  ],
  irrelevantJobs: [
    {
      title: 'DevOps Engineer',
      company: 'AWS',
      description: 'DevOps Engineer to manage cloud infrastructure. Requires experience with Docker, Kubernetes, Terraform, and CI/CD pipelines. AWS services expertise needed including EC2, ECS, Lambda, and CloudFormation. Linux administration and scripting skills required.',
    },
    {
      title: 'Journeyman Plumber',
      company: 'Roto-Rooter',
      description: 'Licensed Journeyman Plumber for residential and commercial projects. Must have experience with pipe fitting, soldering, drain cleaning, and code compliance. Backflow prevention certification required. Knowledge of water heater installation and gas line work preferred.',
    },
  ],
}

export const PERSONAS: Persona[] = [
  softwareEngineer,
  registeredNurse,
  journeymanElectrician,
  marketingManager,
]
