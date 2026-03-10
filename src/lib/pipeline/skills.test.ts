import { describe, expect, it } from 'vitest'

import { extractSkillMatches } from './skills'

describe('extractSkillMatches', () => {
  it('matches skills found in description', () => {
    const result = extractSkillMatches(
      'We need Python and Django developers with AWS experience',
      ['Python', 'Django', 'AWS'],
    )
    expect(result).toEqual(['Python', 'Django', 'AWS'])
  })

  it('returns empty for no matches', () => {
    const result = extractSkillMatches(
      'We need a friendly person who loves teamwork',
      ['Rust', 'Kubernetes'],
    )
    expect(result).toEqual([])
  })

  it('word boundary: "Go" does NOT match "go above and beyond"', () => {
    const result = extractSkillMatches(
      'We want someone who will go above and beyond in this role',
      ['Go'],
    )
    expect(result).toEqual([])
  })

  it('word boundary: "Go" matches standalone "Go" language', () => {
    const result = extractSkillMatches(
      'Required skills: Go, Python, Docker',
      ['Go'],
    )
    expect(result).toEqual(['Go'])
  })

  it('handles special chars: C++', () => {
    const result = extractSkillMatches(
      'Experience with C++ and low-level systems programming',
      ['C++'],
    )
    expect(result).toEqual(['C++'])
  })

  it('handles special chars: C#', () => {
    const result = extractSkillMatches(
      'Must have C# and .NET experience',
      ['C#'],
    )
    expect(result).toEqual(['C#'])
  })

  it('handles special chars: Node.js', () => {
    const result = extractSkillMatches(
      'Backend development with Node.js and Express',
      ['Node.js'],
    )
    expect(result).toEqual(['Node.js'])
  })

  it('handles special chars: CI/CD', () => {
    const result = extractSkillMatches(
      'Setup and maintain CI/CD pipelines',
      ['CI/CD'],
    )
    expect(result).toEqual(['CI/CD'])
  })

  it('returns empty for empty skills array', () => {
    expect(extractSkillMatches('Some job description', [])).toEqual([])
  })

  it('returns empty for empty description', () => {
    expect(extractSkillMatches('', ['Python'])).toEqual([])
  })

  it('is case-insensitive', () => {
    const result = extractSkillMatches(
      'experience with PYTHON and react is required',
      ['Python', 'React'],
    )
    expect(result).toEqual(['Python', 'React'])
  })

  it('handles non-tech skills: nursing', () => {
    const result = extractSkillMatches(
      'Requires IV Therapy certification and ACLS certification. Experience in Critical Care preferred.',
      ['IV Therapy', 'ACLS', 'Critical Care', 'Python'],
    )
    expect(result).toEqual(['IV Therapy', 'ACLS', 'Critical Care'])
  })

  it('handles marketing skills', () => {
    const result = extractSkillMatches(
      'Must have experience with SEO, Google Analytics, and HubSpot CRM',
      ['SEO', 'Google Analytics', 'HubSpot', 'Python'],
    )
    expect(result).toEqual(['SEO', 'Google Analytics', 'HubSpot'])
  })
})
