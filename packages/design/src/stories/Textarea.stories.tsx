import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from '../components/Textarea.js';

const meta: Meta<typeof Textarea> = {
  title: 'Components/Textarea',
  component: Textarea,
  argTypes: {
    disabled: { control: 'boolean' },
    error: { control: 'text' },
    label: { control: 'text' },
    resize: {
      control: 'select',
      options: ['none', 'vertical', 'both'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: { placeholder: 'Enter your notes...' },
};

export const WithLabel: Story = {
  args: { label: 'Secure Notes', placeholder: 'Add private notes to this item...' },
};

export const WithError: Story = {
  args: {
    label: 'Notes',
    error: 'Notes cannot exceed 5000 characters',
    defaultValue: 'Some content that is too long...',
  },
};

export const ResizeNone: Story = {
  args: {
    label: 'Fixed Size',
    placeholder: 'This textarea cannot be resized',
    resize: 'none',
  },
};

export const Tall: Story = {
  args: {
    label: 'Description',
    placeholder: 'Write a detailed description...',
    style: { minHeight: 200 },
  },
};
