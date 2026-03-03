import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Select } from '../components/Select.js';

const defaultOptions = [
  { value: 'login', label: 'Login' },
  { value: 'card', label: 'Credit Card' },
  { value: 'note', label: 'Secure Note' },
  { value: 'identity', label: 'Identity' },
];

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  argTypes: {
    disabled: { control: 'boolean' },
    error: { control: 'text' },
    label: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  args: { options: defaultOptions },
};

export const WithLabel: Story = {
  args: { label: 'Item Type', options: defaultOptions },
};

export const WithError: Story = {
  args: {
    label: 'Category',
    options: defaultOptions,
    error: 'Please select a valid category',
  },
};

export const Disabled: Story = {
  args: { label: 'Locked', options: defaultOptions, disabled: true },
};

export const ManyOptions: Story = {
  args: {
    label: 'Time Zone',
    options: [
      { value: 'utc-12', label: 'UTC-12:00 Baker Island' },
      { value: 'utc-11', label: 'UTC-11:00 American Samoa' },
      { value: 'utc-10', label: 'UTC-10:00 Hawaii' },
      { value: 'utc-9', label: 'UTC-09:00 Alaska' },
      { value: 'utc-8', label: 'UTC-08:00 Pacific' },
      { value: 'utc-7', label: 'UTC-07:00 Mountain' },
      { value: 'utc-6', label: 'UTC-06:00 Central' },
      { value: 'utc-5', label: 'UTC-05:00 Eastern' },
      { value: 'utc-4', label: 'UTC-04:00 Atlantic' },
      { value: 'utc-3', label: 'UTC-03:00 Buenos Aires' },
      { value: 'utc-2', label: 'UTC-02:00 South Georgia' },
      { value: 'utc-1', label: 'UTC-01:00 Azores' },
      { value: 'utc+0', label: 'UTC+00:00 London' },
      { value: 'utc+1', label: 'UTC+01:00 Berlin' },
      { value: 'utc+2', label: 'UTC+02:00 Cairo' },
      { value: 'utc+3', label: 'UTC+03:00 Moscow' },
      { value: 'utc+5.5', label: 'UTC+05:30 Mumbai' },
      { value: 'utc+8', label: 'UTC+08:00 Singapore' },
      { value: 'utc+9', label: 'UTC+09:00 Tokyo' },
      { value: 'utc+12', label: 'UTC+12:00 Auckland' },
    ],
  },
};
