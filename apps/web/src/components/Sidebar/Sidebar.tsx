import { NavLink } from 'react-router-dom';
import { BookIcon, CardsIcon, HeadphonesIcon, HomeIcon, MicIcon, PenIcon } from '../Icons';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  /** Cards due for review (Phase 4). */
  dueCount?: number;
  /** Shown in password mode. */
  onLogout?: () => void;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.item} ${styles.active}` : styles.item;

export function Sidebar({ dueCount = 0, onLogout }: SidebarProps) {
  return (
    <nav aria-label="Điều hướng chính" className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.logo} aria-hidden="true">
          D
        </div>
        <div className={styles.name}>DailyLearning</div>
      </div>
      <div className={styles.items}>
        <NavLink to="/" end className={navClass}>
          <HomeIcon />
          Trang chủ
        </NavLink>
        <NavLink to="/read" className={navClass}>
          <BookIcon />
          Đọc
        </NavLink>
        <NavLink to="/listen" className={navClass}>
          <HeadphonesIcon />
          Nghe
        </NavLink>
        <NavLink to="/vocab" className={navClass}>
          <CardsIcon />
          Từ vựng
          <span className={styles.badge}>
            {dueCount}
            <span className="visually-hidden"> thẻ đến hạn</span>
          </span>
        </NavLink>
      </div>
      <div className={styles.soon}>
        <div className={styles.soonTitle}>Sắp có ở v2</div>
        <div className={styles.soonItem}>
          <MicIcon />
          Nói
        </div>
        <div className={styles.soonItem}>
          <PenIcon />
          Viết
        </div>
      </div>
      {onLogout && (
        <button type="button" className={styles.logout} onClick={onLogout}>
          Đăng xuất
        </button>
      )}
    </nav>
  );
}
