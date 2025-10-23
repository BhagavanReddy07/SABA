import React, { useState, useEffect } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { Modal, Button, Form, ListGroup, Badge } from "react-bootstrap";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function MyCalendar() {
  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem("myEvents");
    if (saved) {
      return JSON.parse(saved).map((e) => ({
        ...e,
        start: new Date(e.start),
        end: new Date(e.end),
      }));
    }
    return [];
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventSlot, setNewEventSlot] = useState({ start: null, end: null });

  // NEW: for daily events modal
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDayEvents, setSelectedDayEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    localStorage.setItem("myEvents", JSON.stringify(events));
  }, [events]);

  // Open modal when slot is clicked
  const handleSelectSlot = ({ start, end }) => {
    setNewEventSlot({ start, end });
    setShowModal(true);
  };

  // Save new event
  const handleSaveEvent = () => {
    if (newEventTitle.trim() === "") return;
    const newEvent = {
      id: Date.now(),
      title: newEventTitle,
      start: newEventSlot.start,
      end: newEventSlot.end,
    };
    setEvents([...events, newEvent]);
    setNewEventTitle("");
    setShowModal(false);
  };

  // Delete event
  const handleDeleteEvent = (id) => {
    const updatedEvents = events.filter((e) => e.id !== id);
    setEvents(updatedEvents);
  };

  // When a day is clicked, show all tasks for that day
  const handleDayClick = (slotInfo) => {
    const clickedDate = slotInfo.start;
    const dayEvents = events.filter((e) => isSameDay(e.start, clickedDate));
    if (dayEvents.length > 0) {
      setSelectedDay(clickedDate);
      setSelectedDayEvents(dayEvents);
      setShowDayModal(true);
    }
  };

  // Render custom event content (like +2 more)
  const eventPropGetter = (event) => ({
    style: {
      backgroundColor: "#007bff",
      color: "white",
      borderRadius: "5px",
      border: "none",
      padding: "2px 4px",
    },
  });

  return (
    <div className="container mt-4">
      <h3 className="mb-3 text-center">📅 My Professional Calendar</h3>

      <Calendar
        localizer={localizer}
        culture="en-US"
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: "70vh", borderRadius: "10px" }}
        views={["month", "week", "day", "agenda"]}
        selectable
        resizable
        draggableAccessor={() => true}
        date={currentDate}
        onNavigate={(date) => setCurrentDate(date)}
        onSelectSlot={handleDayClick} // clicking day shows all events
        eventPropGetter={eventPropGetter}
      />

      {/* Add Event Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Event</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="eventTitle">
              <Form.Label>Event Title</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter event title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveEvent}>
            Save Event
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Day Details Modal */}
      <Modal
        show={showDayModal}
        onHide={() => setShowDayModal(false)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Tasks on{" "}
            {selectedDay ? format(selectedDay, "EEEE, MMMM d yyyy") : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedDayEvents.length > 0 ? (
            <ListGroup>
              {selectedDayEvents.map((e) => (
                <ListGroup.Item
                  key={e.id}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <h6 className="mb-1">{e.title}</h6>
                    <small>
                      {format(e.start, "hh:mm a")} - {format(e.end, "hh:mm a")}
                    </small>
                  </div>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteEvent(e.id)}
                  >
                    Delete
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          ) : (
            <p className="text-muted">No events for this day.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDayModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default MyCalendar;
