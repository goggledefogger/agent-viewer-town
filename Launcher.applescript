on run
	do shell script "bash \"REPLACE_WITH_START_SCRIPT\" > /dev/null 2>&1 &"
	delay 2
	do shell script "open http://localhost:5173"
end run

on quit
	try
		do shell script "kill $(cat /tmp/agent-viewer-dev.pid)"
	end try
	try
		do shell script "pkill -f 'concurrently.*packages/server'"
	end try
	try
		do shell script "pkill -f 'tsx watch src/index.ts'"
	end try
	try
		do shell script "pkill -f 'vite'"
	end try
	continue quit
end quit
