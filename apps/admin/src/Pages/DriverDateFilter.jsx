import {
  Box,
  Text,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  TagCloseButton
} from "@chakra-ui/react";
import { subDays, addDays } from "date-fns";
import { useEffect } from "react";
import { format, zonedTimeToUtc } from 'date-fns-tz';
import DatePicker, { DateObject } from "react-multi-date-picker";
import DatePanel from "react-multi-date-picker/plugins/date_panel";
import { Input, InputGroup, InputRightElement, Icon, IconButton, Tooltip  } from "@chakra-ui/react";
import { FiCalendar } from "react-icons/fi";
import { BsCalendar3 } from "react-icons/bs";


const DateFilter = ({ selectedDates, setSelectedDates, startDate, endDate }) => {
const today = new Date(new Date().toDateString()); 
const minDate = new DateObject(startDate); 
  const maxDate = new DateObject(endDate); 



useEffect(() => {
    if (!selectedDates || selectedDates.length === 0) {
      const localISODate = format(today, 'yyyy-MM-dd');
      const label = today.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      setSelectedDates([{ label, value: localISODate }]);
    }
  }, [selectedDates]);
  

  const handleRemoveDate = (valueToRemove) => {
    const updated = selectedDates.filter((d) => d.value !== valueToRemove);
    setSelectedDates(updated);
  };



const CustomInputWithCalendarIcon = ({ openCalendar, value }) => (
  <InputGroup maxW="300px" onClick={openCalendar} cursor="pointer">
    <Input
      value={value}
      readOnly
      placeholder="Select date"
      bg="white"
      border="1px solid #CBD5E0"
    />
    <InputRightElement pointerEvents="none">
      <Icon as={FiCalendar} color="gray.500" />
    </InputRightElement>
  </InputGroup>
);

const CustomInputWithIconOnly = ({ openCalendar }) => (
  <IconButton
    icon={<FiCalendar />}
    onClick={openCalendar}
    aria-label="Select date"
    colorScheme="blue"
    variant="solid"
    size="md"
  />
);
  return (
    <Box mb={4}>
      <Text fontWeight="bold" mb={2}>Filter by Date (Pickup/Dropoff):</Text>

      {/* <DatePicker
        value={selectedDates.map(d => new DateObject(d.value))}
        onChange={dates => {
          const formatted = dates.map(d => {
            const val = d.format("YYYY-MM-DD");
            return { label: val, value: val };
          });
          setSelectedDates(formatted);
        }}
        multiple
        sort
        minDate={minDate}
        maxDate={maxDate}
        format="YYYY-MM-DD"
        className="teal rmdp-mobile" // Mobile responsive
        style={{
          width: "100%",
          maxWidth: "300px"
        }}
      /> */}

<DatePicker
  value={selectedDates.map(d => new DateObject(d.value))}
  onChange={dates => {
    const formatted = dates.map(d => {
      const val = d.format("YYYY-MM-DD");
      return { label: val, value: val };
    });
    setSelectedDates(formatted);
  }}
  multiple
  sort
  minDate={minDate}
  maxDate={maxDate}
  format="YYYY-MM-DD"
  render={<CustomInputWithIconOnly />}
/>



      {/* ✅ Selected Dates as Tags with ❌ */}
      {selectedDates.length > 0 && (
        <Wrap mt={3}>
          {selectedDates.map((date) => (
            <WrapItem key={date.value}>
              <Tag size="md" variant="solid" colorScheme="teal">
                <TagLabel>{date.label}</TagLabel>
                <TagCloseButton onClick={() => handleRemoveDate(date.value)} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
      )}
    </Box>
  );
};

export default DateFilter;
