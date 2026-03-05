// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect,it } from 'vitest'

import Page from './page'

describe('Root Page', () => {
  it('should render the app shell', () => {
    render(<Page />)
    expect(screen.getByText('Recon')).toBeDefined()
  })
})
