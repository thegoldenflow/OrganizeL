import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Briefcase, Code2, GraduationCap, Leaf, Shapes } from 'lucide-react'
import type { Category } from '../data/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'soft'
type Size = 'sm' | 'md' | 'lg'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode; iconRight?: ReactNode }) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background,color,box-shadow,border-color,transform] duration-150 select-none active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100'
  // 触屏上统一加高，保证点击区域 ≥40–48px
  const sizes: Record<Size, string> = {
    sm: 'h-8 px-3 text-[13px] rounded-lg touch:h-11 touch:px-4',
    md: 'h-10 px-4 text-[14px] rounded-xl touch:h-11',
    lg: 'h-12 px-5 text-[15px] rounded-xl',
  }
  const variants: Record<Variant, string> = {
    primary:
      'bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_1px_2px_rgba(31,76,66,0.3)] hover:bg-accent-hover disabled:hover:bg-accent',
    secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-[#fbfaf7]',
    soft: 'bg-accent-soft text-accent-ink hover:bg-[#d5e6de]',
    ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
    quiet: 'text-muted hover:text-ink px-2',
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  )
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink touch:h-11 touch:w-11',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

const CAT_STYLE: Record<Category, { cls: string; icon: ReactNode }> = {
  求职: { cls: 'bg-accent-soft text-accent-ink', icon: <Briefcase size={12} aria-hidden /> },
  学习: { cls: 'bg-sky-soft text-sky-ink', icon: <GraduationCap size={12} aria-hidden /> },
  个人项目: { cls: 'bg-plum-soft text-plum-ink', icon: <Code2 size={12} aria-hidden /> },
  生活: { cls: 'bg-amber-soft text-amber-ink', icon: <Leaf size={12} aria-hidden /> },
  其他: { cls: 'bg-sunken text-ink-2', icon: <Shapes size={12} aria-hidden /> },
}

export function CategoryTag({ category }: { category: Category }) {
  const s = CAT_STYLE[category]
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-[12px] font-medium', s.cls)}>
      {s.icon}
      {category}
    </span>
  )
}

export function Pill({
  children,
  tone = 'neutral',
  icon,
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'amber' | 'sky' | 'plum' | 'outline'
  icon?: ReactNode
  className?: string
}) {
  const tones = {
    neutral: 'bg-sunken text-ink-2',
    accent: 'bg-accent-soft text-accent-ink',
    amber: 'bg-amber-soft text-amber-ink',
    sky: 'bg-sky-soft text-sky-ink',
    plum: 'bg-plum-soft text-plum-ink',
    outline: 'border border-line text-ink-2 bg-surface',
  }
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function SectionHeader({ title, hint, right }: { title: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {right}
    </div>
  )
}

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
      <div className="mb-2 text-ghost">{icon}</div>
      <p className="text-[14px] font-medium text-ink-2">{title}</p>
      {hint && <p className="mt-1 max-w-[32em] text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** 完成时的勾：圆点放大 + 对勾一笔画出。全应用唯一一处“有分量”的动效 */
export function CheckDraw({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
      <circle cx="14" cy="14" r="13" className="origin-center animate-pop fill-accent" style={{ transformBox: 'fill-box' }} />
      <path
        d="M8.5 14.5l3.6 3.6 7.4-7.6"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw"
        style={{ strokeDasharray: 18, ['--dash' as string]: '18' }}
      />
    </svg>
  )
}

/** 下拉菜单的通用外观 */
export const menuPanel =
  'absolute z-50 animate-rise rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-raised)]'
export const menuItem =
  'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink focus-visible:bg-sunken focus-visible:text-ink disabled:opacity-45 disabled:hover:bg-transparent touch:py-3'

/** 中文标题换行时，不把引号里的短名称从中间拆开（例如“校园二手书交易平台”） */
export function KeepPhrases({ text }: { text: string }) {
  const parts = text.split(/(“[^”]{1,16}”[^\s，。；、“”]{0,3})/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="sm:whitespace-nowrap">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}
