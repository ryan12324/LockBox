/**
 * Emergency kit PDF generation using jsPDF.
 * Contains the recovery key for vault access restoration.
 */

import { jsPDF } from 'jspdf';

export function generateEmergencyKitPDF(email: string, recoveryKey: string): void {
  const doc = new jsPDF();
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Lockbox Emergency Kit', 20, 30);

  // Subtitle
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Keep this document in a safe place. Do not share it with anyone.', 20, 42);

  // Divider
  doc.setDrawColor(200);
  doc.line(20, 48, 190, 48);

  // Account info
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Account Email:', 20, 62);
  doc.setFont('helvetica', 'normal');
  doc.text(email, 70, 62);

  doc.setFont('helvetica', 'bold');
  doc.text('Date Created:', 20, 72);
  doc.setFont('helvetica', 'normal');
  doc.text(date, 70, 72);

  // Recovery key section
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Recovery Key', 20, 92);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(
    'Use this key to regain access to your vault if you forget your master password.',
    20,
    102,
  );

  // Recovery key box
  doc.setDrawColor(0);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(20, 110, 170, 20, 3, 3, 'FD');

  doc.setFontSize(14);
  doc.setFont('courier', 'bold');
  doc.setTextColor(0);
  doc.text(recoveryKey, 105, 123, { align: 'center' });

  // Instructions
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);

  const instructions = [
    '1. Print this document and store it in a secure physical location.',
    '2. Do not store this document digitally without encryption.',
    '3. This key cannot be regenerated — if lost, vault access cannot be recovered.',
    '4. To use: go to the Lockbox login page and click "Emergency Recovery".',
  ];

  let y = 145;
  for (const line of instructions) {
    doc.text(line, 20, y);
    y += 10;
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text('Lockbox — Self-Hosted Password Manager', 105, 280, { align: 'center' });

  // Download
  doc.save(`lockbox-emergency-kit-${date.replace(/\s/g, '-')}.pdf`);
}
