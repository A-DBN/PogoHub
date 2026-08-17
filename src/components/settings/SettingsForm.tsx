'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ExternalLink, Save } from 'lucide-react';
import { Button, Card, Input, Label, Section } from '@/components/ui';
import { Dropdown } from '@/components/ui/Dropdown';
import { useT } from '@/i18n/client';
import { LOCALES } from '@/i18n/config';
import {
  TEAM_COLORS,
  TRAINER_TEAMS,
  formatFriendCode,
  type TrainerTeamKey,
} from '@/lib/pogo/trainer';
import { changePassword, updateProfile, type ProfileResult } from '@/server/actions/profile';
import { updateRecoveryPicks, type RecoveryResult } from '@/server/actions/recovery';
import { RecoveryPicker, type PickedSpecies } from '@/components/auth/RecoveryPicker';
import { RECOVERY_PICKS } from '@/lib/pogo/recovery';
import { cn } from '@/lib/cn';

export type SettingsValues = {
  username: string;
  avatarUrl: string;
  bio: string;
  team: string;
  trainerLevel: string;
  friendCode: string;
  friendCodePublic: boolean;
  shinyPublic: boolean;
  teamsPublicByDefault: boolean;
  locale: string;
  tradeOpen: boolean;
  /** Seuil de proposition automatique, `''` = jamais. */
  autoTradeFrom: string;
  tradeNote: string;
};

/** Case à cocher : le libellé entier est cliquable, la cible est plus large. */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="text-sm">{label}</span>
        {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
      {error ? (
        <span className="text-[11px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

export function SettingsForm({
  initial,
  hasRecovery,
}: {
  initial: SettingsValues;
  /** Des Pokémon de secours existent-ils ? Leur contenu, lui, reste illisible. */
  hasRecovery: boolean;
}) {
  const { dict, locale } = useT();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Pokémon de récupération : on ne réaffiche jamais les choix existants, ils
  // sont hachés. On les remplace, on ne les consulte pas.
  const [picks, setPicks] = useState<PickedSpecies[]>([]);
  const [picksPassword, setPicksPassword] = useState('');
  const [picksResult, setPicksResult] = useState<RecoveryResult | null>(null);
  const [picksSaved, setPicksSaved] = useState(false);
  const [picksPending, startPicks] = useTransition();
  const [recorded, setRecorded] = useState(hasRecovery);

  const savePicks = () => {
    setPicksSaved(false);
    startPicks(async () => {
      const outcome = await updateRecoveryPicks(
        picksPassword,
        picks.map((pick) => pick.speciesId),
      );
      setPicksResult(outcome);
      if (outcome.ok) {
        setPicksSaved(true);
        setPicksPassword('');
        // l'état passe à « enregistrés » sans attendre un rechargement
        setRecorded(true);
        setPicks([]);
        setTimeout(() => setPicksSaved(false), 4000);
      }
    });
  };

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordResult, setPasswordResult] = useState<ProfileResult | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordPending, startPassword] = useTransition();

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /** Message d'erreur du champ visé, ou rien : chaque ligne signale la sienne. */
  const errorFor = (field: string) =>
    result && !result.ok && result.field === field
      ? (dict.settings.errors[result.error as keyof typeof dict.settings.errors] ?? result.error)
      : null;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      const outcome = await updateProfile(values);
      setResult(outcome);
      if (outcome.ok) {
        setSaved(true);
        // le pseudo fait partie de l'URL publique : la barre doit suivre
        router.refresh();
        setTimeout(() => setSaved(false), 4000);
      }
    });
  };

  const submitPassword = () => {
    setPasswordSaved(false);
    startPassword(async () => {
      const outcome = await changePassword(passwords.current, passwords.next, passwords.confirm);
      setPasswordResult(outcome);
      if (outcome.ok) {
        setPasswordSaved(true);
        setPasswords({ current: '', next: '', confirm: '' });
        setTimeout(() => setPasswordSaved(false), 4000);
      }
    });
  };

  const teamOptions = [
    { value: '', label: dict.settings.teams.NONE },
    ...TRAINER_TEAMS.map((key: TrainerTeamKey) => ({
      value: key,
      label: dict.settings.teams[key],
      leading: (
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: TEAM_COLORS[key] }}
        />
      ),
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section title={dict.settings.identity}>
        <Card className="flex flex-col gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={dict.settings.username}
              hint={dict.settings.usernameHelp}
              error={errorFor('username')}
            >
              <Input
                value={values.username}
                onChange={(event) => set('username', event.target.value)}
                maxLength={20}
              />
            </Field>

            <Field
              label={dict.settings.avatarUrl}
              hint={dict.settings.avatarHelp}
              error={errorFor('avatarUrl')}
            >
              <Input
                value={values.avatarUrl}
                onChange={(event) => set('avatarUrl', event.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
            </Field>
          </div>

          <Field label={dict.settings.bio} hint={dict.settings.bioHelp}>
            <textarea
              value={values.bio}
              onChange={(event) => set('bio', event.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border border-white/[0.09] bg-white/[0.05] px-3 py-2 text-sm outline-none transition focus:border-white/20 focus:bg-white/[0.08]"
            />
          </Field>
        </Card>
      </Section>

      <Section title={dict.settings.trainer}>
        <Card className="grid gap-4 p-4 md:grid-cols-3">
          <Field label={dict.settings.team}>
            <Dropdown
              value={values.team}
              options={teamOptions}
              onChange={(value) => set('team', value)}
              accent={TEAM_COLORS[values.team as TrainerTeamKey] ?? null}
            />
          </Field>

          <Field label={dict.settings.trainerLevel} error={errorFor('trainerLevel')}>
            <Input
              value={values.trainerLevel}
              onChange={(event) => set('trainerLevel', event.target.value)}
              inputMode="numeric"
              placeholder="1 – 80"
            />
          </Field>

          <Field
            label={dict.settings.friendCode}
            hint={dict.settings.friendCodeHelp}
            error={errorFor('friendCode')}
          >
            <Input
              value={values.friendCode}
              onChange={(event) => set('friendCode', event.target.value)}
              inputMode="numeric"
              placeholder={formatFriendCode('000000000000')}
            />
          </Field>
        </Card>
      </Section>

      <Section title={dict.settings.privacy}>
        <Card className="flex flex-col gap-1 p-4">
          <Toggle
            checked={values.friendCodePublic}
            onChange={(value) => set('friendCodePublic', value)}
            label={dict.settings.friendCodePublic}
            hint={values.friendCodePublic ? undefined : dict.settings.friendCodePrivate}
          />
          <Toggle
            checked={values.shinyPublic}
            onChange={(value) => set('shinyPublic', value)}
            label={dict.settings.shinyPublic}
          />
          <Toggle
            checked={values.teamsPublicByDefault}
            onChange={(value) => set('teamsPublicByDefault', value)}
            label={dict.settings.teamsPublicByDefault}
          />
        </Card>
      </Section>

      <Section title={dict.trades.settings}>
        <Card className="flex flex-col gap-4 p-4">
          <Toggle
            checked={values.tradeOpen}
            onChange={(value) => set('tradeOpen', value)}
            label={dict.trades.open}
            hint={dict.trades.openHelp}
          />

          <Field label={dict.trades.autoFrom} hint={dict.trades.autoHelp}>
            <Dropdown
              value={values.autoTradeFrom}
              // Le seuil part de 2 : un exemplaire unique n'est pas un doublon,
              // le proposer reviendrait à céder son seul spécimen.
              options={[
                { value: '', label: dict.trades.autoNever },
                ...[2, 3, 4, 5].map((n) => ({
                  value: String(n),
                  label: `${n} ${dict.trades.autoFromUnit}`,
                })),
              ]}
              onChange={(value) => set('autoTradeFrom', value)}
              className="max-w-[18rem]"
            />
          </Field>

          <Field label={dict.trades.note} hint={dict.trades.noteHelp}>
            <Input
              value={values.tradeNote}
              onChange={(event) => set('tradeNote', event.target.value)}
              maxLength={200}
            />
          </Field>
        </Card>
      </Section>

      <Section title={dict.settings.account}>
        <Card className="flex flex-col gap-4 p-4">
          <Field label={dict.settings.locale}>
            <Dropdown
              value={values.locale}
              options={LOCALES.map((code) => ({
                value: code,
                label: code === 'fr' ? 'Français' : 'English',
              }))}
              onChange={(value) => set('locale', value)}
              className="max-w-[16rem]"
            />
          </Field>

          <div className="border-t border-white/[0.07] pt-4">
            <Label>{dict.recovery.legend}</Label>
            {/* Les choix sont hachés : impossible de les réafficher. Sans cette
                ligne, des cases vides après rafraîchissement ressemblent à une
                sauvegarde perdue. */}
            <p
              className={cn(
                'mt-0.5 text-[11px]',
                recorded ? 'text-success' : 'text-warn',
              )}
            >
              {recorded ? dict.recovery.alreadySet : dict.recovery.notSet}
            </p>
            <p className="mt-0.5 mb-2 text-[11px] text-muted">{dict.recovery.warnPublic}</p>
            <RecoveryPicker value={picks} onChange={setPicks} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Input
                type="password"
                autoComplete="current-password"
                value={picksPassword}
                onChange={(event) => setPicksPassword(event.target.value)}
                placeholder={dict.recovery.confirmWithPassword}
                className="max-w-[20rem]"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={savePicks}
                disabled={picksPending || picks.length < RECOVERY_PICKS || !picksPassword}
              >
                {dict.recovery.changePicks}
              </Button>
              {picksSaved ? (
                <span className="inline-flex items-center gap-1 text-sm text-success">
                  <Check size={14} />
                  {dict.recovery.picksSaved}
                </span>
              ) : null}
              {picksResult && !picksResult.ok ? (
                <span className="text-sm text-danger">
                  {dict.recovery.errors[
                    picksResult.error as keyof typeof dict.recovery.errors
                  ] ?? picksResult.error}
                </span>
              ) : null}
            </div>
          </div>

          <div className="border-t border-white/[0.07] pt-4">
            <Label>{dict.settings.password}</Label>
            <div className="mt-1 grid gap-3 md:grid-cols-3">
              <Input
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) =>
                  setPasswords((current) => ({ ...current, current: event.target.value }))
                }
                placeholder={dict.settings.currentPassword}
              />
              <Input
                type="password"
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) =>
                  setPasswords((current) => ({ ...current, next: event.target.value }))
                }
                placeholder={dict.settings.newPassword}
              />
              <Input
                type="password"
                autoComplete="new-password"
                value={passwords.confirm}
                onChange={(event) =>
                  setPasswords((current) => ({ ...current, confirm: event.target.value }))
                }
                placeholder={dict.settings.confirmPassword}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={submitPassword}
                disabled={passwordPending || !passwords.current || !passwords.next}
              >
                {dict.settings.changePassword}
              </Button>
              {passwordSaved ? (
                <span className="inline-flex items-center gap-1 text-sm text-success">
                  <Check size={14} />
                  {dict.settings.passwordChanged}
                </span>
              ) : null}
              {passwordResult && !passwordResult.ok ? (
                <span className="text-sm text-danger">
                  {dict.settings.errors[
                    passwordResult.error as keyof typeof dict.settings.errors
                  ] ?? passwordResult.error}
                </span>
              ) : null}
            </div>
          </div>
        </Card>
      </Section>

      <div
        className={cn(
          'sticky bottom-4 flex flex-wrap items-center gap-3 rounded-xl',
          'border border-white/[0.09] bg-bg/90 px-4 py-3 backdrop-blur',
        )}
      >
        <Button type="button" onClick={save} disabled={pending}>
          <Save size={15} />
          {pending ? dict.teams.saving : dict.settings.save}
        </Button>

        {saved ? (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check size={14} />
            {dict.settings.saved}
          </span>
        ) : null}

        {result && !result.ok && !result.field ? (
          <span className="text-sm text-danger">
            {dict.settings.errors[result.error as keyof typeof dict.settings.errors] ??
              result.error}
          </span>
        ) : null}

        {initial.username ? (
          <Link
            href={`/${locale}/players/${initial.username}`}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted transition hover:text-ink"
          >
            {dict.settings.viewProfile}
            <ExternalLink size={13} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
