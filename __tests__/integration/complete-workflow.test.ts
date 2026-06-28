import { render, screen } from '@testing-library/react'
import Home from '../../app/page'
import React from 'react'

jest.mock('../../components/project-selector', () => ({
  ProjectSelector: () => React.createElement('div', { 'data-testid': 'project-selector' }, 'Project selector'),
}))

describe('complete workflow smoke', () => {
  test('home page renders core shell', () => {
    render(React.createElement(Home))

    expect(screen.getByText('WhatHappen')).toBeInTheDocument()
    expect(screen.getByTestId('project-selector')).toBeInTheDocument()
  })
})
