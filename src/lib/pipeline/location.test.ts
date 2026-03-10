import { describe, expect, it } from 'vitest'

import { extractCountry } from './location'

describe('extractCountry', () => {
  describe('US state abbreviations', () => {
    it('should detect "San Francisco, CA" as US', () => {
      expect(extractCountry('San Francisco, CA')).toBe('US')
    })

    it('should detect "New York, NY" as US', () => {
      expect(extractCountry('New York, NY')).toBe('US')
    })

    it('should detect "Austin, TX, United States" as US', () => {
      expect(extractCountry('Austin, TX, United States')).toBe('US')
    })

    it('should detect "Washington, DC" as US', () => {
      expect(extractCountry('Washington, DC')).toBe('US')
    })

    it('should detect "Chicago, IL" as US', () => {
      expect(extractCountry('Chicago, IL')).toBe('US')
    })

    it('should detect "Denver, CO" as US', () => {
      expect(extractCountry('Denver, CO')).toBe('US')
    })

    it('should detect "San Juan, PR" as US (territory)', () => {
      expect(extractCountry('San Juan, PR')).toBe('US')
    })

    it('should detect "Hagatna, GU" as US (territory)', () => {
      expect(extractCountry('Hagatna, GU')).toBe('US')
    })
  })

  describe('US full state names', () => {
    it('should detect "Boston, Massachusetts" as US', () => {
      expect(extractCountry('Boston, Massachusetts')).toBe('US')
    })

    it('should detect "Los Angeles, California" as US', () => {
      expect(extractCountry('Los Angeles, California')).toBe('US')
    })

    it('should detect "Portland, Oregon" as US', () => {
      expect(extractCountry('Portland, Oregon')).toBe('US')
    })
  })

  describe('US country name variants', () => {
    it('should detect "United States" as US', () => {
      expect(extractCountry('United States')).toBe('US')
    })

    it('should detect "USA" as US', () => {
      expect(extractCountry('USA')).toBe('US')
    })

    it('should detect "New York, NY, US" as US', () => {
      expect(extractCountry('New York, NY, US')).toBe('US')
    })
  })

  describe('international countries', () => {
    it('should detect "Bangalore, India" as IN', () => {
      expect(extractCountry('Bangalore, India')).toBe('IN')
    })

    it('should detect "London, UK" as GB', () => {
      expect(extractCountry('London, UK')).toBe('GB')
    })

    it('should detect "London, United Kingdom" as GB', () => {
      expect(extractCountry('London, United Kingdom')).toBe('GB')
    })

    it('should detect "Toronto, Canada" as CA', () => {
      expect(extractCountry('Toronto, Canada')).toBe('CA')
    })

    it('should detect "Berlin, Germany" as DE', () => {
      expect(extractCountry('Berlin, Germany')).toBe('DE')
    })

    it('should detect "Sydney, Australia" as AU', () => {
      expect(extractCountry('Sydney, Australia')).toBe('AU')
    })

    it('should detect "Paris, France" as FR', () => {
      expect(extractCountry('Paris, France')).toBe('FR')
    })

    it('should detect "Tokyo, Japan" as JP', () => {
      expect(extractCountry('Tokyo, Japan')).toBe('JP')
    })

    it('should detect "Amsterdam, Netherlands" as NL', () => {
      expect(extractCountry('Amsterdam, Netherlands')).toBe('NL')
    })

    it('should detect "Dublin, Ireland" as IE', () => {
      expect(extractCountry('Dublin, Ireland')).toBe('IE')
    })

    it('should detect "Singapore" as SG', () => {
      expect(extractCountry('Singapore')).toBe('SG')
    })

    it('should detect "Tel Aviv, Israel" as IL', () => {
      expect(extractCountry('Tel Aviv, Israel')).toBe('IL')
    })

    it('should detect "Bangalore, Karnataka, India" as IN (multi-segment)', () => {
      expect(extractCountry('Bangalore, Karnataka, India')).toBe('IN')
    })

    it('should detect "São Paulo, Brazil" as BR', () => {
      expect(extractCountry('São Paulo, Brazil')).toBe('BR')
    })
  })

  describe('remote variants', () => {
    it('should default "Remote" to US', () => {
      expect(extractCountry('Remote')).toBe('US')
    })

    it('should detect "Remote - US" as US', () => {
      expect(extractCountry('Remote - US')).toBe('US')
    })

    it('should detect "Remote - India" as IN', () => {
      expect(extractCountry('Remote - India')).toBe('IN')
    })

    it('should default "Remote (Anywhere)" to US', () => {
      expect(extractCountry('Remote (Anywhere)')).toBe('US')
    })

    it('should detect "Hybrid Remote, San Francisco, CA" as US', () => {
      expect(extractCountry('Hybrid Remote, San Francisco, CA')).toBe('US')
    })

    it('should detect "Remote - UK" as GB', () => {
      expect(extractCountry('Remote - UK')).toBe('GB')
    })

    it('should detect "Remote, Canada" as CA', () => {
      expect(extractCountry('Remote, Canada')).toBe('CA')
    })
  })

  describe('edge cases', () => {
    it('should return "Unknown" for null', () => {
      expect(extractCountry(null)).toBe('Unknown')
    })

    it('should return "Unknown" for undefined', () => {
      expect(extractCountry(undefined)).toBe('Unknown')
    })

    it('should return "Unknown" for empty string', () => {
      expect(extractCountry('')).toBe('Unknown')
    })

    it('should return "Unknown" for "Competitive location"', () => {
      expect(extractCountry('Competitive location')).toBe('Unknown')
    })

    it('should return "Unknown" for "Multiple Locations"', () => {
      expect(extractCountry('Multiple Locations')).toBe('Unknown')
    })

    it('should return "Unknown" for "EMEA"', () => {
      expect(extractCountry('EMEA')).toBe('Unknown')
    })

    it('should handle whitespace-only input', () => {
      expect(extractCountry('   ')).toBe('Unknown')
    })

    it('should handle case-insensitive matching', () => {
      expect(extractCountry('bangalore, india')).toBe('IN')
      expect(extractCountry('LONDON, UK')).toBe('GB')
    })
  })
})
