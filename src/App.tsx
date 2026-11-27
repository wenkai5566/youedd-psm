import { useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { BookingDetailDrawer } from './components/BookingDetailDrawer';
import {
  BookingFormModal,
  type BookingDraftPreset,
} from './components/BookingFormModal';
import { BookingsListView } from './components/BookingsListView';
import { HousekeepingView } from './components/HousekeepingView';
import {
  RoomBlockModal,
  type RoomBlockDraftPreset,
} from './components/RoomBlockModal';
import { RoomTimelineView } from './components/RoomTimelineView';
import { SettingsView } from './components/SettingsView';
import { ToastContainer } from './components/ToastContainer';
import { TodayOperationsView } from './components/TodayOperationsView';
import { getTodayISO } from './domain/bookingLogic';
import { useGuesthouseData } from './hooks/useGuesthouseData';
import { useMediaQuery } from './hooks/useMediaQuery';
import type { AppView, Booking, BookingInput, RoomBlock } from './types/domain';

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [selectedView, setSelectedView] = useState<AppView | null>(null);
  const activeView: AppView = selectedView ?? (isDesktop ? 'timeline' : 'today');

  const [todayDate, setTodayDate] = useState<string>(() => getTodayISO());

  const [inspectedBookingId, setInspectedBookingId] = useState<string | null>(
    null
  );
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [draftPreset, setDraftPreset] = useState<BookingDraftPreset | null>(null);

  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<RoomBlock | null>(null);
  const [blockDraftPreset, setBlockDraftPreset] =
    useState<RoomBlockDraftPreset | null>(null);

  const {
    mode,
    user,
    authReady,
    isAuthorized,
    accessConfig,
    specialHolidayDates,
    rooms,
    bookings,
    roomBlocks,
    toasts,
    pushToast,
    signInWithGoogle,
    signOut,
    saveBooking,
    updateBookingStatus,
    recordBookingDeposit,
    markBookingPaidInFull,
    saveRoom,
    updateRoomHousekeeping,
    deleteRoom,
    saveRoomBlock,
    deleteRoomBlock,
    updateAllowedEmails,
    updateSpecialHolidays,
    resetDemoData,
  } = useGuesthouseData();

  const todayActionCount = useMemo(() => {
    const today = getTodayISO();
    return bookings.filter(
      (b) =>
        b.status !== 'cancelled' &&
        ((b.checkInDate === today && b.status === 'confirmed') ||
          (b.checkOutDate === today && b.status === 'checked_in'))
    ).length;
  }, [bookings]);

  const dirtyRoomCount = useMemo(
    () =>
      rooms.filter((r) => r.isActive && r.housekeepingStatus === 'dirty').length,
    [rooms]
  );

  const inspectedBooking = useMemo(
    () => bookings.find((b) => b.id === inspectedBookingId) || null,
    [bookings, inspectedBookingId]
  );

  const openNewBooking = (preset?: BookingDraftPreset) => {
    setEditingBooking(null);
    setDraftPreset(preset || null);
    setFormModalOpen(true);
  };

  const openEditBooking = (booking: Booking) => {
    setInspectedBookingId(null);
    setDraftPreset(null);
    setEditingBooking(booking);
    setFormModalOpen(true);
  };

  const openNewRoomBlock = (preset?: RoomBlockDraftPreset) => {
    setEditingBlock(null);
    setBlockDraftPreset(preset || null);
    setBlockModalOpen(true);
  };

  const openInspectRoomBlock = (block: RoomBlock) => {
    setBlockDraftPreset(null);
    setEditingBlock(block);
    setBlockModalOpen(true);
  };

  const handleMoveBooking = async (
    booking: Booking,
    nextInput: BookingInput,
    summaryLabel: string
  ) => {
    try {
      await saveBooking(nextInput, booking.id, summaryLabel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法移動此訂房';
      pushToast(msg, 'error');
    }
  };

  if (!authReady || !user || !isAuthorized) {
    return (
      <>
        <AuthGate
          mode={mode}
          user={user}
          authReady={authReady}
          isAuthorized={isAuthorized}
          allowedEmails={accessConfig.allowedEmails}
          onSignInWithGoogle={signInWithGoogle}
          onSignOut={signOut}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <AppShell
        activeView={activeView}
        onSelectView={setSelectedView}
        onCreateBooking={() => openNewBooking()}
        todayActionCount={todayActionCount}
        dirtyRoomCount={dirtyRoomCount}
        mode={mode}
        user={user}
        onSignOut={signOut}
      >
        {activeView === 'timeline' && (
          <RoomTimelineView
            rooms={rooms}
            bookings={bookings}
            roomBlocks={roomBlocks}
            specialHolidayDates={specialHolidayDates}
            isDesktop={isDesktop}
            onCreateBookingAt={(preset) => openNewBooking(preset)}
            onInspectBooking={(b) => setInspectedBookingId(b.id)}
            onMoveBooking={handleMoveBooking}
            onCreateRoomBlock={openNewRoomBlock}
            onInspectRoomBlock={openInspectRoomBlock}
            onToggleHousekeeping={updateRoomHousekeeping}
            onNotifyError={(msg) => pushToast(msg, 'error')}
          />
        )}

        {activeView === 'today' && (
          <TodayOperationsView
            rooms={rooms}
            bookings={bookings}
            selectedDate={todayDate}
            onChangeDate={setTodayDate}
            onCreateBooking={() => openNewBooking({ checkInDate: todayDate })}
            onInspectBooking={(b) => setInspectedBookingId(b.id)}
          />
        )}

        {activeView === 'bookings' && (
          <BookingsListView
            rooms={rooms}
            bookings={bookings}
            onCreateBooking={() => openNewBooking()}
            onInspectBooking={(b) => setInspectedBookingId(b.id)}
          />
        )}

        {activeView === 'housekeeping' && (
          <HousekeepingView
            rooms={rooms}
            bookings={bookings}
            roomBlocks={roomBlocks}
            onToggleHousekeeping={updateRoomHousekeeping}
          />
        )}

        {activeView === 'settings' && (
          <SettingsView
            mode={mode}
            currentUser={user}
            rooms={rooms}
            accessConfig={accessConfig}
            specialHolidayDates={specialHolidayDates}
            onSaveRoom={saveRoom}
            onDeleteRoom={deleteRoom}
            onUpdateAllowedEmails={updateAllowedEmails}
            onUpdateSpecialHolidays={updateSpecialHolidays}
            onResetDemoData={resetDemoData}
          />
        )}
      </AppShell>

      <BookingDetailDrawer
        booking={inspectedBooking}
        allBookings={bookings}
        rooms={rooms}
        onClose={() => setInspectedBookingId(null)}
        onEdit={openEditBooking}
        onStatusChange={updateBookingStatus}
        onRecordDeposit={recordBookingDeposit}
        onMarkPaidInFull={markBookingPaidInFull}
        onNotify={(msg) => pushToast(msg, 'success')}
      />

      {formModalOpen && (
        <BookingFormModal
          key={`${editingBooking?.id || 'new'}-${(draftPreset?.roomIds || []).join(',')}-${draftPreset?.checkInDate || ''}-${draftPreset?.checkOutDate || ''}`}
          rooms={rooms}
          bookings={bookings}
          roomBlocks={roomBlocks}
          specialHolidayDates={specialHolidayDates}
          editingBooking={editingBooking}
          preset={draftPreset}
          onClose={() => setFormModalOpen(false)}
          onSubmit={async (input, existingId) => {
            await saveBooking(input, existingId);
          }}
        />
      )}

      {blockModalOpen && (
        <RoomBlockModal
          key={`${editingBlock?.id || 'new'}-${blockDraftPreset?.roomId || ''}-${blockDraftPreset?.startDate || ''}`}
          rooms={rooms}
          bookings={bookings}
          roomBlocks={roomBlocks}
          editingBlock={editingBlock}
          preset={blockDraftPreset}
          onClose={() => setBlockModalOpen(false)}
          onSubmit={async (input, existingBlockId) => {
            await saveRoomBlock(input, existingBlockId);
          }}
          onDelete={deleteRoomBlock}
        />
      )}

      <ToastContainer toasts={toasts} />
    </>
  );
}
