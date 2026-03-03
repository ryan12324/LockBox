import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '../components/Input.js';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'search', 'email'],
    },
    disabled: { control: 'boolean' },
    error: { control: 'text' },
    label: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: 'Enter your name...' },
};

export const WithLabel: Story = {
  args: { label: 'Username', placeholder: 'your-username' },
};

export const Password: Story = {
  args: { type: 'password', label: 'Master Password', placeholder: 'Enter your master password' },
};

export const Search: Story = {
  args: { type: 'search', placeholder: 'Search vault...' },
};

export const Email: Story = {
  args: { type: 'email', label: 'Email Address', placeholder: 'you@example.com' },
};

export const WithError: Story = {
  args: {
    label: 'Master Password',
    type: 'password',
    error: 'Password must be at least 12 characters',
    defaultValue: 'short',
  },
};

export const Disabled: Story = {
  args: { label: 'Locked Field', placeholder: 'Cannot edit', disabled: true },
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 360 }}>
      <Input label="Default" placeholder="Type here..." />
      <Input label="Password" type="password" placeholder="Enter password" />
      <Input label="Error State" error="This field is required" placeholder="Required" />
      <Input label="Disabled" disabled placeholder="Cannot edit" />
      <Input label="Email" type="email" placeholder="user@lockbox.dev" />
      <Input label="Search" type="search" placeholder="Search your vault..." />
    </div>
  ),
};
