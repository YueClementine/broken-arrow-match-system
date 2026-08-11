import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PrivacyConfirmation } from './PrivacyConfirmation';

describe('PrivacyConfirmation', () => {
  it('requires an explicit acknowledgement that room data is public', async () => {
    const onChange = vi.fn();
    render(<PrivacyConfirmation checked={false} onChange={onChange} />);

    expect(screen.getByText(/昵称、QQ 和所选 BATrace 历史资料将在房间页公开/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
