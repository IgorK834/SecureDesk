import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppShellComponent } from './shared/layout/app-shell.component';

@Component({
  imports: [RouterOutlet, AppShellComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
