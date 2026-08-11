type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function PrivacyConfirmation({ checked, onChange }: Props) {
  return (
    <label className="privacy-confirmation">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>我已知晓：昵称、QQ 和所选 BATrace 历史资料将在房间页公开。</span>
    </label>
  );
}
